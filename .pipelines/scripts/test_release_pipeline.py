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
MANUAL_STAGE = 'Prod_npm_release'


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


def instantiate(template, parameters, kind):
    defaults = {p['name']: p['default'] for p in template['parameters'] if 'default' in p}
    return expand(template[kind], defaults | parameters)


STAGES = {}
for entry in ENTRIES:
    if 'stage' in entry:
        STAGES[entry['stage']] = entry
    else:
        for stage in instantiate(TEMPLATE, entry['parameters'], 'stages'):
            STAGES[stage['stage']] = stage

NPM_STAGES = (MANUAL_STAGE, 'npm_release_prepare', 'Prod_npm_publish', 'npm_release_finalize')
RELEASE_JOBS = {job['job']: job for name in NPM_STAGES for job in STAGES[name]['jobs']}
JOB_STAGES = {job['job']: name for name in NPM_STAGES for job in STAGES[name]['jobs']}


def dependencies(node):
    names = node.get('dependsOn', [])
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
    for name, stage in STAGES.items():
        values[f'dependencies.{name}.result'] = 'Succeeded'
        for job in stage['jobs']:
            values[f"stageDependencies.{name}.{job['job']}.result"] = 'Succeeded'
    for key in ('emulator', *NPM_KEYS):
        values[f"dependencies.release_check.outputs['check.read.{key}_needsRelease']"] = str(key in affected).lower()
        values[f"stageDependencies.npm_release_prepare.{key}_check.outputs['read.{key}_needsRelease']"] = str(key in affected).lower()
        values[f'dependencies.{key}_build.result'] = 'Succeeded' if key in affected else 'Skipped'
    return values


def permits(stage, values, canceled=False):
    return evaluate(STAGES[stage]['condition'], values, canceled)


def permits_job(name, values, canceled=False):
    job = RELEASE_JOBS[name]
    job_values = {f'dependencies.{dep}.result': 'Succeeded' for dep in dependencies(job)}
    job_values.update(values)
    for variable, expression in job.get('variables', {}).items():
        if isinstance(expression, str) and expression.startswith('$[ '):
            job_values[f"variables['{variable}']"] = values.get(expression[3:-2].strip(), '')
    return permits(JOB_STAGES[name], values, canceled) and evaluate(job['condition'], job_values, canceled)


class ReleasePipelineTests(unittest.TestCase):
    def test_unconditional_templates_no_runtime_switches(self):
        self.assertNotIn('parameters', PIPELINE)
        self.assertNotIn('publish_package', {p['name'] for p in TEMPLATE['parameters']})
        self.assertEqual([e['parameters']['package_key'] for e in ENTRIES if 'template' in e], list(NPM_KEYS))
        self.assertTrue(PIPELINE['trigger']['batch'])
        self.assertEqual(PIPELINE['trigger']['branches']['include'], ['main'])
        self.assertEqual(PIPELINE['pr'], 'none')

    def test_manual_release_jobs_are_inline(self):
        expected = {
            MANUAL_STAGE: ['verify', 'approve'],
            'npm_release_prepare': [f'{key}_check' for key in NPM_KEYS],
            'Prod_npm_publish': [f'{key}_publish' for key in NPM_KEYS],
            'npm_release_finalize': [f'{key}_{suffix}' for key in NPM_KEYS
                                     for suffix in ('post_deploy_tag', 'post_deploy_pr')],
        }
        for name, jobs in expected.items():
            self.assertEqual([job['job'] for job in STAGES[name]['jobs']], jobs)
            self.assertNotIn('"template":', json.dumps(STAGES[name]))
            self.assertNotIn('${{', json.dumps(STAGES[name]))

    def test_stage_and_release_job_graphs(self):
        self.assertEqual(len(STAGES), 10)
        self.assertEqual(len(RELEASE_JOBS), 14)
        graphs = [STAGES] + [{job['job']: job for job in stage['jobs']} for stage in STAGES.values()]
        for graph in graphs:
            completed = set()

            def visit(name, path):
                self.assertNotIn(name, path, f'Cycle through {name}')
                self.assertIn(name, graph)
                if name not in completed:
                    for dependency in dependencies(graph[name]):
                        visit(dependency, {*path, name})
                    completed.add(name)

            for name in graph:
                visit(name, set())
        for stage in STAGES.values():
            self.assertIs(stage['isSkippable'], False)
        self.assertEqual(dependencies(STAGES['emulator_build']), ['release_check'])
        self.assertEqual(set(dependencies(STAGES['emulator_myget'])), {'release_check', 'emulator_build'})
        self.assertNotIn('dependsOn', STAGES[MANUAL_STAGE])
        self.assertNotIn('dependencies.', STAGES[MANUAL_STAGE]['condition'])
        self.assertNotIn('stageDependencies.', json.dumps(STAGES[MANUAL_STAGE]))
        self.assertEqual(dependencies(RELEASE_JOBS['approve']), ['verify'])
        self.assertEqual(dependencies(STAGES['npm_release_prepare']), [MANUAL_STAGE])
        self.assertEqual(dependencies(STAGES['Prod_npm_publish']), [MANUAL_STAGE, 'npm_release_prepare'])
        self.assertEqual(dependencies(STAGES['npm_release_finalize']),
                         [MANUAL_STAGE, 'npm_release_prepare', 'Prod_npm_publish'])

    def test_automatic_ci_is_independent_of_the_manual_release_chain(self):
        manual = [name for name, stage in STAGES.items() if stage.get('trigger') == 'manual']
        self.assertEqual(manual, [MANUAL_STAGE])
        self.assertEqual(STAGES[MANUAL_STAGE]['variables']['ob_release_environment'], 'Production')
        self.assertTrue(PIPELINE['extends']['parameters']['featureFlags']['use1esentry'])
        for name, stage in STAGES.items():
            if name in NPM_STAGES:
                continue
            self.assertEqual(stage.get('trigger', 'automatic'), 'automatic')
            self.assertTrue(set(dependencies(stage)).isdisjoint(NPM_STAGES))
            for forbidden in ('ManualValidation@1', 'EsrpRelease@11', 'git push', 'Npm-Release.mjs bump'):
                self.assertNotIn(forbidden, json.dumps(stage), name)
        for name in NPM_STAGES[1:]:
            self.assertEqual(STAGES[name].get('trigger', 'automatic'), 'automatic')
            for result in ('Skipped', 'Failed', 'Canceled', 'Pending', 'SucceededWithIssues', ''):
                values = context(NPM_KEYS)
                values[f'dependencies.{MANUAL_STAGE}.result'] = result
                self.assertFalse(permits(name, values), (name, result))
            self.assertTrue(permits(name, context(NPM_KEYS)))

    def test_onebranch_release_jobs_are_artifact_only_and_git_jobs_are_normal_linux_jobs(self):
        for stage in STAGES.values():
            release = any(job['pool']['type'] in ('release', 'server') for job in stage['jobs'])
            for job in stage['jobs']:
                if release:
                    self.assertIn(job['pool']['type'], ('release', 'server'))
                    for step in job['steps']:
                        self.assertNotIn('checkout', step)
                    for item in job.get('templateContext', {}).get('inputs', []):
                        self.assertEqual(item['input'], 'pipelineArtifact')
                        self.assertNotIn('buildVersionToDownload', item)
                    for forbidden in ('git clone', 'git push', 'persistCredentials', 'getGithubAuthorization'):
                        self.assertNotIn(forbidden, json.dumps(job))
                else:
                    self.assertEqual(job['pool'], {'type': 'linux'})
        for key in NPM_KEYS:
            for suffix in ('check', 'post_deploy_tag', 'post_deploy_pr'):
                job = RELEASE_JOBS[f'{key}_{suffix}']
                self.assertEqual(job['pool'], {'type': 'linux'})
                self.assertEqual(job['steps'][0]['checkout'], 'self')
                self.assertIs(job['steps'][0]['persistCredentials'], True)
                self.assertNotIn('ref', job['steps'][0])
            self.assertIs(RELEASE_JOBS[f'{key}_post_deploy_tag']['steps'][0]['fetchTags'], True)
            self.assertEqual(dependencies(RELEASE_JOBS[f'{key}_post_deploy_pr']), [f'{key}_post_deploy_tag'])

    def test_cross_stage_output_bindings_reference_real_direct_dependencies(self):
        pattern = re.compile(r"\$\[ stageDependencies\.(\w+)\.(\w+)\.(result|outputs\['([^']+)'\]) \]")
        for name in NPM_STAGES:
            for match in pattern.finditer(json.dumps(STAGES[name])):
                stage_name, job_name, kind, output = match.groups()
                self.assertIn(stage_name, dependencies(STAGES[name]))
                self.assertNotEqual(stage_name, MANUAL_STAGE)
                job = next(job for job in STAGES[stage_name]['jobs'] if job['job'] == job_name)
                if output:
                    self.assertEqual(output.split('.')[0], 'read')
                    self.assertIn('read', [step.get('name') for step in job['steps']])

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
                npm_eligible = eligible and (branch == 'refs/heads/main' or branch.startswith('refs/heads/release/'))
                self.assertEqual(permits(MANUAL_STAGE, values), npm_eligible)
        # Manually starting a stage of a CI run does not change Build.Reason to Manual.
        for reason in ('IndividualCI', 'BatchedCI', 'Manual'):
            self.assertTrue(permits(MANUAL_STAGE, context(NPM_KEYS, reason=reason)))

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

    def test_preflight_blocks_approval_and_all_publication_side_effects(self):
        for result in ('Skipped', 'Failed', 'Canceled', 'SucceededWithIssues', 'Pending', ''):
            values = context(NPM_KEYS)
            values['dependencies.verify.result'] = result
            self.assertFalse(permits_job('approve', values), result)
            values[f'dependencies.{MANUAL_STAGE}.result'] = result
            for name in RELEASE_JOBS:
                if name not in ('verify', 'approve'):
                    self.assertFalse(permits_job(name, values), (name, result))
        self.assertTrue(permits_job('approve', context(NPM_KEYS)))

    def test_preflight_uses_same_run_helper_and_artifact_names(self):
        verify = RELEASE_JOBS['verify']
        self.assertEqual(verify['pool'], {'type': 'release', 'os': 'linux'})
        self.assertEqual(verify['templateContext']['inputs'], [{
            'input': 'pipelineArtifact', 'artifactName': 'drop_release_source',
            'targetPath': '$(Pipeline.Workspace)/release-source/$(Build.BuildId)',
        }])
        step = verify['steps'][-1]
        self.assertEqual(step['name'], 'read')
        self.assertIn('node .pipelines/scripts/Get-ReadyNpmRelease.mjs --from-artifact', step['inputs']['script'])
        self.assertEqual(step['inputs']['workingDirectory'], verify['templateContext']['inputs'][0]['targetPath'])
        self.assertEqual(step['env'], {'SYSTEM_ACCESSTOKEN': '$(System.AccessToken)'})
        check = STAGES['release_check']['jobs'][0]
        self.assertEqual(check['variables']['ob_artifactBaseName'], 'drop_release_source')
        self.assertIn("Get-ReadyNpmRelease.mjs --prepare-artifact '$(ob_outputDirectory)'", check['steps'][-1]['inputs']['script'])
        output = subprocess.check_output([
            'node', '--input-type=module', '-e',
            "import {NPM_ARTIFACTS,RELEASE_SOURCE_ARTIFACT} from './.pipelines/scripts/Get-ReadyNpmRelease.mjs'; console.log(JSON.stringify([NPM_ARTIFACTS,RELEASE_SOURCE_ARTIFACT]))"
        ], cwd=ROOT, text=True)
        expected = {key: STAGES[f'{key}_build']['jobs'][0]['variables']['ob_artifactBaseName'] for key in NPM_KEYS}
        self.assertEqual(json.loads(output), [expected, 'drop_release_source'])

    def test_publication_requires_approval_and_verified_package_selection(self):
        states = ('Succeeded', 'Failed', 'Canceled', 'Skipped', 'Pending', 'SucceededWithIssues', '')
        for key in NPM_KEYS:
            for gate, verification, selected in itertools.product(states, states, ('true', 'false', '')):
                values = context([key])
                values[f'dependencies.{MANUAL_STAGE}.result'] = gate
                values[f'stageDependencies.npm_release_prepare.{key}_check.result'] = verification
                values[f"stageDependencies.npm_release_prepare.{key}_check.outputs['read.{key}_needsRelease']"] = selected
                self.assertEqual(permits_job(f'{key}_publish', values),
                                 gate == verification == 'Succeeded' and selected == 'true')
            values = context([key])
            del values[f"stageDependencies.npm_release_prepare.{key}_check.outputs['read.{key}_needsRelease']"]
            self.assertFalse(permits_job(f'{key}_publish', values))
            for publish, tag in itertools.product(states, repeat=2):
                values = context([key])
                values[f'stageDependencies.Prod_npm_publish.{key}_publish.result'] = publish
                values[f'dependencies.{key}_post_deploy_tag.result'] = tag
                self.assertEqual(permits_job(f'{key}_post_deploy_tag', values), publish == 'Succeeded')
                self.assertEqual(permits_job(f'{key}_post_deploy_pr', values), publish == tag == 'Succeeded')

    def test_unrelated_package_failure_does_not_prevent_successful_package_finalization(self):
        for key in NPM_KEYS:
            values = context(NPM_KEYS)
            values['dependencies.npm_release_prepare.result'] = 'Failed'
            values['dependencies.Prod_npm_publish.result'] = 'Failed'
            for other in NPM_KEYS:
                if other != key:
                    values[f'stageDependencies.npm_release_prepare.{other}_check.result'] = 'Failed'
                    values[f'stageDependencies.Prod_npm_publish.{other}_publish.result'] = 'Failed'
                    self.assertFalse(permits_job(f'{other}_publish', values))
                    self.assertFalse(permits_job(f'{other}_post_deploy_tag', values))
            self.assertTrue(permits_job(f'{key}_publish', values))
            self.assertTrue(permits_job(f'{key}_post_deploy_tag', values))
            self.assertTrue(permits_job(f'{key}_post_deploy_pr', values))

    def test_cancellation_blocks_every_stage_and_release_job(self):
        for name in STAGES:
            self.assertFalse(permits(name, context((*NPM_KEYS, 'emulator')), canceled=True), name)
        for name in RELEASE_JOBS:
            self.assertFalse(permits_job(name, context(NPM_KEYS), canceled=True), name)

    def test_agentless_npm_only_approval(self):
        job = RELEASE_JOBS['approve']
        self.assertEqual(job['pool'], {'type': 'server'})
        self.assertEqual(job['timeoutInMinutes'], 1500)
        step = job['steps'][0]
        self.assertEqual(step['task'], 'ManualValidation@1')
        self.assertEqual(step['timeoutInMinutes'], 1440)
        self.assertEqual(step['inputs']['onTimeout'], 'reject')
        self.assertEqual(step['inputs']['notifyUsers'], '')
        self.assertIs(step['inputs']['allowApproversToApproveTheirOwnRuns'], True)
        self.assertNotIn('approvers', step['inputs'])

    def test_manual_release_reuses_same_run_artifacts_without_building(self):
        build_packages = {e['parameters']['package_key']: e['parameters'] for e in ENTRIES if 'template' in e}
        for key, package in build_packages.items():
            build = STAGES[f'{key}_build']['jobs'][0]
            publish = RELEASE_JOBS[f'{key}_publish']
            self.assertEqual(publish['pool'], {'type': 'release', 'os': 'windows'})
            self.assertEqual(publish['templateContext']['inputs'], [{
                'input': 'pipelineArtifact',
                'artifactName': build['variables']['ob_artifactBaseName'],
                'targetPath': f'$(Pipeline.Workspace)/esrp-release/$(Build.BuildId)/{key}',
            }])
            for variable in ('needsRelease', 'releaseVersion', 'productState'):
                self.assertEqual(publish['variables'][variable],
                                 f"$[ stageDependencies.npm_release_prepare.{key}_check.outputs['read.{key}_{variable}'] ]")
            steps = publish['steps']
            self.assertEqual(len(steps), 1)
            self.assertEqual(steps[-1]['task'], 'EsrpRelease@11')
            self.assertEqual(steps[-1]['inputs']['FolderLocation'],
                             publish['templateContext']['inputs'][0]['targetPath'])
            self.assertEqual(steps[-1]['inputs']['ContentType'], 'npm')
            self.assertEqual(steps[-1]['inputs']['ConnectedServiceName'], '$(ESRP_SERVICE_CONNECTION)')
            check = RELEASE_JOBS[f'{key}_check']
            self.assertIn('node .pipelines/scripts/Get-ReadyNpmRelease.mjs', check['steps'][-2]['inputs']['script'])
            self.assertEqual(check['steps'][-2]['name'], 'read')
            self.assertEqual(check['steps'][-1]['condition'],
                             f"and(succeeded(), eq(variables['read.{key}_needsRelease'], 'true'))")
            check_script = check['steps'][-1]['inputs']['script']
            self.assertIn('Npm-Release.mjs check', check_script)
            self.assertIn(f"'$(read.{key}_releaseVersion)'", check_script)
            for field in ('package_folder', 'npm_package_name', 'package_name'):
                self.assertIn(f"'{package[field]}'", check_script)
            tag_script = RELEASE_JOBS[f'{key}_post_deploy_tag']['steps'][-1]['inputs']['script']
            self.assertIn(f'tag="release/{package["package_name"]}/v$(releaseVersion)"', tag_script)
            pr_script = RELEASE_JOBS[f'{key}_post_deploy_pr']['steps'][-1]['inputs']['script']
            self.assertIn(f"PACKAGE_FOLDER='{package['package_folder']}'", pr_script)
            self.assertIn(f"PACKAGE_NAME='{package['package_name']}'", pr_script)
            for suffix in ('check', 'publish', 'post_deploy_tag', 'post_deploy_pr'):
                job = RELEASE_JOBS[f'{key}_{suffix}']
                self.assertNotIn('continueOnError', job)
                for step in job['steps']:
                    self.assertNotIn('continueOnError', step)
                scripts = '\n'.join(step.get('inputs', {}).get('script', '') for step in job['steps'])
                self.assertNotRegex(scripts, r'\b(?:yarn\s|npm\s+(?:run|pack)\b)')
                self.assertNotIn('Build-EmulatorPackage.ps1', scripts)
            for suffix in ('post_deploy_tag', 'post_deploy_pr'):
                self.assertEqual(RELEASE_JOBS[f'{key}_{suffix}']['pool'], {'type': 'linux'})

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
