"""Bounded checks of the actual release YAML, not OneBranch/cloud expansion.

Run: python -m unittest discover -s .pipelines/scripts -p test_release_pipeline.py
Requires PyYAML. Dependency-free Node helper tests run separately.
"""

import itertools
import json
from pathlib import Path
import re
import subprocess
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[2]
PIPELINE = yaml.safe_load((ROOT / '.pipelines/release.yml').read_text(encoding='utf-8'))
TEMPLATE = yaml.safe_load((ROOT / '.pipelines/templates/stages/release-package.yml').read_text(encoding='utf-8'))
ENTRIES = PIPELINE['extends']['parameters']['stages']
NPM_KEYS = ('chat_client', 'socketio', 'tunnel')


def expand(value, parameters):
    if isinstance(value, str):
        value = re.sub(
            r"\$\{\{\s*format\('([^']+)', parameters\.(\w+)\)\s*\}\}",
            lambda m: m[1].format(parameters[m[2]]), value)
        return re.sub(r'\$\{\{\s*parameters\.(\w+)\s*\}\}',
                      lambda m: str(parameters.get(m[1], m[0])), value)
    if isinstance(value, list):
        return [expand(item, parameters) for item in value]
    if isinstance(value, dict):
        return {expand(k, parameters): expand(v, parameters) for k, v in value.items()}
    return value


STAGES = {}
for entry in ENTRIES:
    if 'stage' in entry:
        STAGES[entry['stage']] = entry
    else:
        for stage in expand(TEMPLATE['stages'], entry['parameters']):
            STAGES[stage['stage']] = stage


def dependencies(stage):
    names = stage['dependsOn']
    return [names] if isinstance(names, str) else names


def evaluate(expression, values, canceled=False):
    """Evaluate only the condition operators used in this pipeline; reject others."""
    token = re.compile(
        r"\s*(dependencies\.\w+\.(?:result|outputs\['[^']+'\])|"
        r"variables\['[^']+'\]|'(?:[^']|'')*'|[A-Za-z_]\w*|[(),])")
    tokens = []
    position = 0
    expression = expression.strip()
    while position < len(expression):
        match = token.match(expression, position)
        if not match:
            raise AssertionError(f'Unsupported condition syntax: {expression[position:]}')
        tokens.append(match[1])
        position = match.end()
    position = 0
    operators = {
        'and': lambda *args: all(args), 'or': lambda *args: any(args),
        'not': lambda arg: not arg, 'eq': lambda a, b: a == b,
        'ne': lambda a, b: a != b, 'in': lambda a, *args: a in args,
        'startsWith': lambda a, b: a.startswith(b), 'canceled': lambda: canceled,
    }

    def read():
        nonlocal position
        current = tokens[position]
        position += 1
        if current.startswith("'"):
            return current[1:-1].replace("''", "'")
        if current.startswith(('dependencies.', 'variables[')):
            return values.get(current, '')
        if tokens[position] != '(' or current not in operators:
            raise AssertionError(f'Unsupported operator: {current}')
        position += 1
        arguments = []
        while tokens[position] != ')':
            arguments.append(read())
            if tokens[position] == ',':
                position += 1
            elif tokens[position] != ')':
                raise AssertionError('Expected comma or closing parenthesis')
        position += 1
        return operators[current](*arguments)

    result = read()
    if position != len(tokens):
        raise AssertionError('Unconsumed condition tokens')
    return result


def context(affected=(), branch='refs/heads/main', reason='IndividualCI'):
    values = {"variables['Build.SourceBranch']": branch, "variables['Build.Reason']": reason}
    for name in STAGES:
        values[f'dependencies.{name}.result'] = 'Succeeded'
    for key in ('emulator', *NPM_KEYS):
        values[f"dependencies.release_check.outputs['check.read.{key}_needsRelease']"] = str(key in affected).lower()
        values[f'dependencies.{key}_build.result'] = 'Succeeded' if key in affected else 'Skipped'
    return values


def permits(stage, values, canceled=False):
    return evaluate(STAGES[stage]['condition'], values, canceled)


class ReleasePipelineTests(unittest.TestCase):
    def test_unconditional_templates_no_runtime_switches(self):
        self.assertNotIn('parameters', PIPELINE)
        self.assertNotIn('publish_package', {p['name'] for p in TEMPLATE['parameters']})
        self.assertEqual([e['parameters']['package_key'] for e in ENTRIES if 'template' in e], list(NPM_KEYS))
        self.assertFalse(PIPELINE['trigger']['batch'])
        self.assertEqual(PIPELINE['trigger']['branches']['include'], ['main'])
        self.assertEqual(PIPELINE['pr'], 'none')

    def test_graph_and_non_skippable_automatic_stages(self):
        self.assertEqual(len(STAGES), 16)
        completed = set()

        def visit(name, path):
            self.assertNotIn(name, path, f'Cycle through {name}')
            self.assertIn(name, STAGES)
            if name not in completed:
                for dependency in dependencies(STAGES[name]):
                    visit(dependency, {*path, name})
                completed.add(name)

        for name in STAGES:
            visit(name, set())
        for name in ('release_check', 'emulator_build', 'emulator_myget', 'manual_release',
                     *(f'{key}_build' for key in NPM_KEYS)):
            self.assertIs(STAGES[name]['isSkippable'], False)
        self.assertEqual(dependencies(STAGES['emulator_build']), ['release_check'])
        self.assertEqual(set(dependencies(STAGES['emulator_myget'])), {'release_check', 'emulator_build'})
        self.assertNotIn('emulator_build', dependencies(STAGES['manual_release']))
        self.assertNotIn('emulator_myget', dependencies(STAGES['manual_release']))

    def test_trigger_mapping_matches_detector(self):
        output = subprocess.check_output([
            'node', '--input-type=module', '-e',
            "import {TRIGGER_PATHS} from './.pipelines/scripts/Get-ReleasePackages.mjs'; console.log(JSON.stringify(TRIGGER_PATHS))"
        ], cwd=ROOT, text=True)
        self.assertEqual(set(PIPELINE['trigger']['paths']['include']), set(json.loads(output)))

    def test_branch_eligibility_and_manual_test_branch(self):
        cases = [('refs/heads/main', 'IndividualCI', True),
                 ('refs/heads/release/1.0', 'Manual', True),
                 ('refs/heads/vicancy/vicancy-fix-emulator-publish-runtime', 'Manual', True),
                 ('refs/heads/vicancy/vicancy-fix-emulator-publish-runtime', 'IndividualCI', False),
                 ('refs/heads/topic', 'Manual', False), ('refs/pull/1/merge', 'PullRequest', False)]
        for branch, reason, eligible in cases:
            with self.subTest(branch=branch, reason=reason):
                values = context((*NPM_KEYS, 'emulator'), branch, reason)
                self.assertEqual(permits('release_check', values), eligible)
                if not eligible:
                    values['dependencies.release_check.result'] = 'Skipped'
                self.assertEqual(permits('emulator_myget', values), eligible)
                npm_eligible = eligible and branch.startswith(('refs/heads/main', 'refs/heads/release/'))
                self.assertEqual(permits('manual_release', values), npm_eligible)
                for key in NPM_KEYS:
                    self.assertEqual(permits(f'Prod_{key}_publish', values), npm_eligible)

    def test_affected_builds_and_myget_fail_closed(self):
        for key in ('emulator', *NPM_KEYS):
            self.assertTrue(permits(f'{key}_build', context([key])))
            self.assertFalse(permits(f'{key}_build', context()))
            for result in ('Skipped', 'Failed', 'Canceled', 'SucceededWithIssues', ''):
                values = context([key])
                values['dependencies.release_check.result'] = result
                self.assertFalse(permits(f'{key}_build', values))
        for affected, result in itertools.product((True, False), ('Succeeded', 'Skipped', 'Failed', 'Canceled')):
            values = context(['emulator'] if affected else [])
            values['dependencies.emulator_build.result'] = result
            self.assertEqual(permits('emulator_myget', values), affected and result == 'Succeeded')

    def test_gate_all_affected_and_unaffected_combinations(self):
        for flags in itertools.product((True, False), repeat=3):
            affected = [key for key, flag in zip(NPM_KEYS, flags) if flag]
            for results in itertools.product(('Succeeded', 'Skipped', 'Failed', 'Canceled'), repeat=3):
                values = context(affected)
                for key, result in zip(NPM_KEYS, results):
                    values[f'dependencies.{key}_build.result'] = result
                expected = any(flags) and all(
                    result == 'Succeeded' if flag else result in ('Succeeded', 'Skipped')
                    for flag, result in zip(flags, results))
                self.assertEqual(permits('manual_release', values), expected, (flags, results))
        self.assertFalse(permits('manual_release', context(['emulator'])))

    def test_publication_requires_approval_and_own_build(self):
        for key in NPM_KEYS:
            for gate, build in itertools.product(('Succeeded', 'Failed', 'Canceled', 'Skipped', 'Pending', ''), repeat=2):
                values = context([key])
                values['dependencies.manual_release.result'] = gate
                values[f'dependencies.{key}_build.result'] = build
                self.assertEqual(permits(f'Prod_{key}_publish', values), gate == build == 'Succeeded')
            self.assertFalse(permits(f'Prod_{key}_publish', context()))
            for result in ('Skipped', 'Failed', 'Canceled', ''):
                values = context([key])
                values[f'dependencies.Prod_{key}_publish.result'] = result
                self.assertFalse(permits(f'{key}_post_deploy_tag', values))
                self.assertFalse(permits(f'{key}_post_deploy_pr', values))

    def test_cancellation_blocks_every_stage(self):
        for name in STAGES:
            self.assertFalse(permits(name, context((*NPM_KEYS, 'emulator')), canceled=True), name)

    def test_agentless_npm_only_approval(self):
        job = STAGES['manual_release']['jobs'][0]
        self.assertEqual(job['pool'], {'type': 'agentless'})
        self.assertEqual(job['timeoutInMinutes'], 1500)
        step = job['steps'][0]
        self.assertEqual(step['task'], 'ManualValidation@1')
        self.assertEqual(step['timeoutInMinutes'], 1440)
        self.assertEqual(step['inputs']['onTimeout'], 'reject')
        self.assertEqual(step['inputs']['notifyUsers'], '')
        self.assertIs(step['inputs']['allowApproversToApproveTheirOwnRuns'], True)
        self.assertNotIn('approvers', step['inputs'])

    def test_emulator_sign_pack_validate_order_and_artifacts(self):
        build = STAGES['emulator_build']['jobs'][0]
        self.assertEqual(build['pool']['type'], 'linux')
        self.assertEqual(build['variables']['ob_artifactBaseName'], 'drop_emulator')
        steps = build['steps']
        self.assertEqual(steps[1]['task'], 'UseDotNet@2')
        self.assertIs(steps[1]['inputs']['useGlobalJson'], True)
        sdk = json.loads((ROOT / 'tools/emulator/global.json').read_text(encoding='utf-8'))
        self.assertEqual(sdk['sdk']['version'], '10.0.401')
        scripts = [s['inputs']['script'] for s in steps if s.get('task') == 'PowerShell@2']
        self.assertEqual(len(scripts), 3)
        self.assertEqual(sum(s.count('-Phase Build') for s in scripts), 1)
        self.assertIn('-ReleaseVersion -Phase Build', scripts[0])
        self.assertEqual(scripts[1].count('-Phase Pack'), 2)
        self.assertIn('/release', scripts[1])
        self.assertIn('/preview', scripts[1])
        self.assertIn('-ReleaseVersion -Phase Validate -RequireSignature', scripts[2])
        self.assertEqual(scripts[2].count('-RequireSignature'), 1)
        self.assertEqual(scripts[2].count('-Phase Validate'), 2)
        sequence = [s.get('task') for s in steps[2:]]
        self.assertEqual(sequence, ['PowerShell@2', 'onebranch.pipeline.signing@1', 'PowerShell@2',
                                    'onebranch.pipeline.signing@1', 'PowerShell@2'])
        self.assertEqual(steps[3]['inputs']['files_to_sign'], 'obj/Release/*/Microsoft.Azure.WebPubSub.Emulator.dll')
        self.assertEqual(steps[5]['inputs']['search_root'], '$(ob_outputDirectory)/release')
        self.assertEqual(steps[5]['inputs']['cp_code'], 'CP-401405')
        script = (ROOT / '.pipelines/scripts/Build-EmulatorPackage.ps1').read_text(encoding='utf-8')
        self.assertIn('--configuration Release --no-build --no-restore --output', script)
        self.assertIn('$version = "$version-preview-$BuildId"', script)
        self.assertIn('if ($RequireSignature) { Invoke-DotNet nuget verify', script)
        self.assertIn('--configfile $localConfig --no-cache', script)
        self.assertIn('[Net.Http.HttpMethod]::Head', script)
        self.assertIn('Stop-Process -Id $process.Id', script)
        publish = STAGES['emulator_myget']['jobs'][0]
        self.assertEqual(publish['pool'], {'type': 'release', 'os': 'windows'})
        download = publish['templateContext']['inputs'][0]
        self.assertEqual(download['artifactName'], build['variables']['ob_artifactBaseName'])
        self.assertEqual(publish['steps'][0]['inputs']['version'], '8.x')
        task = publish['steps'][1]
        self.assertEqual(task['task'], '1ES.PublishNuGet@1')
        self.assertEqual(task['inputs'], {
            'useDotNetTask': False, 'packageParentPath': download['targetPath'] + '/preview',
            'packagesToPush': download['targetPath'] + '/preview/*.nupkg',
            'nuGetFeedType': 'external', 'publishFeedCredentials': 'azure-webpubsub-dev'})
        for forbidden in ('NuGetApiKeySecretName', 'PackagePublishingAzureSubscription',
                          'PackagePublishingKeyVaultName', 'Prod_emulator_publish', 'AzureKeyVault@2'):
            self.assertNotIn(forbidden, json.dumps(PIPELINE))

    def test_npm_pack_commands_and_full_history(self):
        checkout = STAGES['release_check']['jobs'][0]['steps'][0]
        self.assertEqual(checkout['fetchDepth'], 0)
        packages = {e['parameters']['package_key']: e['parameters'] for e in ENTRIES if 'template' in e}
        for key, package in packages.items():
            script = package['pack_steps'][0]['inputs']['script']
            self.assertIn('yarn --frozen-lockfile', script)
            self.assertIn('yarn test:unit', script)
            self.assertNotRegex(script, r'(?m)^\s*yarn\s*$')
            manifest = json.loads((ROOT / package['package_folder'] / 'package.json').read_text(encoding='utf-8'))
            self.assertIn('test:unit', manifest['scripts'])
            if key == 'chat_client':
                self.assertIn('npm run pack:publish', script)
                self.assertIn('pack:publish', manifest['scripts'])
            else:
                self.assertIn('yarn build', script)
                self.assertIn('yarn pack', script)
                self.assertLess(script.index('pushd sdk/server-proxies'), script.index(f"pushd {package['package_folder']}"))
                self.assertLess(script.index('pushd tools/awps-tunnel/client'), script.index(f"pushd {package['package_folder']}"))
                self.assertEqual(script.count('yarn --frozen-lockfile'), 3)
        self.assertIn('yarn lint', packages['socketio']['pack_steps'][0]['inputs']['script'])
        self.assertIn('yarn test:unit --runInBand', packages['tunnel']['pack_steps'][0]['inputs']['script'])


if __name__ == '__main__':
    unittest.main()
