"""Bounded checks of the actual release YAML, not OneBranch/cloud expansion.

Run: python -m unittest discover -s .pipelines/scripts -p test_release_pipeline.py
Requires PyYAML. Dependency-free Node helper tests run separately.
"""

import copy
import itertools
import json
from pathlib import Path
import re
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[2]
PIPELINE = yaml.safe_load((ROOT / '.pipelines/release.yml').read_text(encoding='utf-8'))
TEMPLATE = yaml.safe_load((ROOT / '.pipelines/templates/stages/release-package.yml').read_text(encoding='utf-8'))
ENTRIES = PIPELINE['extends']['parameters']['stages']
NPM_BUILD_ENTRIES = [entry for entry in ENTRIES
                     if entry.get('template') == 'templates/stages/release-package.yml']
NPM_KEYS = ('chat_client', 'socketio', 'tunnel')
PACKAGE_KEYS = ('emulator', *NPM_KEYS)
RELEASE_KEYS = tuple(key for key in PACKAGE_KEYS if key != 'emulator')
MANUAL_STAGES = tuple(f'Prod_{key}_approve' for key in
                      (*RELEASE_KEYS, 'emulator_container_version', 'emulator_container_latest'))


def expand(value, parameters):
    if isinstance(value, str):
        parameter = re.fullmatch(r'\$\{\{\s*parameters\.(\w+)\s*\}\}', value)
        if parameter:
            return parameters[parameter[1]]
        value = re.sub(
            r"\$\{\{\s*format\('([^']+)', parameters\.(\w+)\)\s*\}\}",
            lambda m: m[1].format(parameters[m[2]]), value)
        return re.sub(r'\$\{\{\s*parameters\.(\w+)\s*\}\}',
                      lambda m: str(parameters.get(m[1], m[0])), value)
    if isinstance(value, list):
        result = []
        for item in value:
            if isinstance(item, dict) and len(item) == 1:
                key = next(iter(item))
                condition = re.fullmatch(r'\$\{\{ if (.+) \}\}', key)
                if condition:
                    if template_condition(condition[1], parameters):
                        result.extend(expand(item[key], parameters))
                    continue
            result.append(expand(item, parameters))
        return result
    if isinstance(value, dict):
        return {expand(k, parameters): expand(v, parameters) for k, v in value.items()}
    return value


def template_condition(expression, parameters):
    """Only the compile-time operators used by container infrastructure configuration."""
    comparison = re.fullmatch(r"(eq|ne)\(parameters\.(\w+), '([^']*)'\)", expression)
    if not comparison:
        raise AssertionError(f'Unsupported template condition: {expression}')
    equal = parameters[comparison[2]] == comparison[3]
    return equal if comparison[1] == 'eq' else not equal


def instantiate(template, parameters, kind):
    defaults = {p['name']: p['default'] for p in template['parameters'] if 'default' in p}
    return expand(template[kind], defaults | parameters)


def expand_stages(entries, directory):
    """Resolve local stage templates; OneBranch expansion is validated in the cloud."""
    for entry in entries:
        if 'stage' in entry:
            yield entry
        else:
            path = directory / entry['template']
            template = yaml.safe_load(path.read_text(encoding='utf-8'))
            stages = instantiate(template, entry.get('parameters', {}), 'stages')
            yield from expand_stages(stages, path.parent)


DEFAULT_PARAMETERS = {p['name']: p['default'] for p in PIPELINE.get('parameters', [])}


def pipeline_stages(**container_configuration):
    # Simulate infrastructure onboarding by changing static template inputs,
    # not queue-time pipeline parameters.
    entries = copy.deepcopy(ENTRIES)
    container = next(e for e in entries if e.get('template') == 'templates/stages/release-emulator-container.yml')
    container['parameters'].update(container_configuration)
    return list(expand_stages(entries, ROOT / '.pipelines'))


EXPANDED_STAGES = pipeline_stages()
STAGES = {stage['stage']: stage for stage in EXPANDED_STAGES}

RELEASE_STAGES = tuple(name for key in RELEASE_KEYS for name in
                       (f'Prod_{key}_approve', f'Prod_{key}_publish', f'{key}_release_finalize'))
RELEASE_JOBS = {job['job']: job for name in RELEASE_STAGES for job in STAGES[name]['jobs']}
JOB_STAGES = {job['job']: name for name in RELEASE_STAGES for job in STAGES[name]['jobs']}


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


def context(branch='refs/heads/main', reason='Manual'):
    values = {"variables['Build.SourceBranch']": branch, "variables['Build.Reason']": reason}
    for name, stage in STAGES.items():
        values[f'dependencies.{name}.result'] = 'Succeeded'
        for job in stage['jobs']:
            values[f"stageDependencies.{name}.{job['job']}.result"] = 'Succeeded'
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
    def test_managed_docker_build_is_automatic_and_uses_the_release_package(self):
        build_stages = {name: stage for name, stage in STAGES.items()
                        if not name.startswith('Prod_emulator_container_')}
        for connection in ('', 'acr-connection'):
            stages = {s['stage']: s for s in pipeline_stages(azure_service_connection=connection)}
            self.assertEqual({name: stages[name] for name in build_stages}, build_stages)
            expected = set(build_stages)
            if connection:
                expected.update(f'Prod_emulator_container_{action}_{step}'
                                for action in ('version', 'latest') for step in ('approve', 'publish'))
            self.assertEqual(set(stages), expected)
        self.assertNotIn('build_pool', json.dumps(PIPELINE))
        build = STAGES['emulator_container_build']
        self.assertEqual(dependencies(build), ['emulator_build'])
        for result in ('Succeeded', 'Failed', 'Skipped', 'Canceled', 'SucceededWithIssues'):
            self.assertEqual(evaluate(build['condition'], {'dependencies.emulator_build.result': result}), result == 'Succeeded')
        job = build['jobs'][0]
        self.assertEqual(job['pool'], {'type': 'docker', 'os': 'linux'})
        self.assertEqual(job['variables']['releaseVersion'], "$[ stageDependencies.emulator_build.build.outputs['read.emulator_releaseVersion'] ]")
        steps = job['steps']
        self.assertEqual([step['task'] for step in steps], ['DownloadPipelineArtifact@2', 'DownloadPipelineArtifact@2', 'onebranch.pipeline.imagebuildinfo@1'])
        self.assertTrue(all(step['inputs']['artifactName'] == 'drop_emulator' and step['inputs']['buildType'] == 'current' for step in steps[:2]))
        self.assertEqual(steps[0]['inputs']['itemPattern'], 'container/*')
        self.assertEqual(steps[0]['inputs']['targetPath'], '$(Build.SourcesDirectory)/dst')
        self.assertEqual(steps[1]['inputs']['itemPattern'], 'container/smoke/**')
        self.assertEqual(steps[1]['inputs']['targetPath'], '/tmp/awps-container-$(Build.BuildId)')
        image = steps[-1]['inputs']
        self.assertEqual(image['dockerFileRelPath'], 'container/Dockerfile')
        self.assertEqual(image['dockerFileContextPath'], 'container')
        self.assertIn('--build-arg EMULATOR_VERSION=$(releaseVersion)', image['arguments'])
        self.assertNotIn('--target', image['arguments'])
        self.assertIn('org.opencontainers.image.revision=$(Build.SourceVersion)', image['arguments'])
        self.assertEqual(image['saveImageToPath'], 'webpubsub-emulator.$(releaseVersion).linux-amd64.tar')
        self.assertIs(image['enable_acr_push'], False)
        self.assertIs(image['enable_isolated_acr_push'], False)
        self.assertIs(image['compress'], False)
        self.assertIs(image['failTaskOnFailedTests'], True)
        self.assertEqual(image['containerTestsYAMLPath'], '$(Build.SourcesDirectory)/dst/container/container-tests.json')

    def test_context_preparation_reuses_package_build_and_installed_node(self):
        self.assertNotIn('emulator_container_prepare', STAGES)
        jobs = STAGES['emulator_build']['jobs']
        self.assertEqual(len(jobs), 1)
        job = jobs[0]
        steps = job['steps']
        self.assertFalse(any(s.get('task') == 'DownloadPipelineArtifact@2' for s in steps))
        node = next(s for s in steps if s.get('task') == 'UseNode@1')
        self.assertEqual(node['inputs']['version'], '$(emulatorSmokeNodeVersion)')
        self.assertRegex(job['variables']['emulatorSmokeNodeVersion'], r'^22\.\d+\.\d+$')
        script = steps[-1]['inputs']['script']
        self.assertLess(script.rindex('-Phase Validate'), script.index('Prepare-EmulatorContainer.ps1'))
        self.assertIn("-PackageDirectory '$(ob_outputDirectory)/release'", script)
        self.assertIn("-Version '$(read.emulator_releaseVersion)'", script)
        self.assertIn("-OutputDirectory '$(ob_outputDirectory)/container'", script)
        self.assertIn("-NodePath '$(Agent.ToolsDirectory)/node/$(emulatorSmokeNodeVersion)/x64/bin/node'", script)

    def test_container_archive_is_recorded_only_after_successful_image_tests(self):
        validate = STAGES['emulator_container_validate']
        self.assertEqual(dependencies(validate), ['emulator_build', 'emulator_container_build'])
        job = validate['jobs'][0]
        self.assertEqual(job['variables']['containerBuildResult'], '$[ stageDependencies.emulator_container_build.container.result ]')
        self.assertEqual(job['variables']['ob_artifactBaseName'], 'drop_emulator_container')
        downloads = [s['inputs'] for s in job['steps'] if s.get('task') == 'DownloadPipelineArtifact@2']
        self.assertEqual([(s['artifactName'], s['itemPattern']) for s in downloads], [
            ('drop_emulator', 'container/container-input.json'),
            ('drop_emulator_container_build_container', 'webpubsub-emulator.*.linux-amd64.tar')])
        self.assertEqual(downloads[1]['targetPath'], '$(ob_outputDirectory)')
        states = ('Succeeded', 'Failed', 'Skipped', 'Canceled', 'SucceededWithIssues', '')
        for preparation, build in itertools.product(states, repeat=2):
            values = context() | {'dependencies.emulator_build.result': preparation,
                                  'dependencies.emulator_container_build.result': build}
            self.assertEqual(evaluate(validate['condition'], values), preparation == build == 'Succeeded')
        for result in states:
            self.assertEqual(evaluate(job['condition'], {"variables['containerBuildResult']": result}), result == 'Succeeded')

    def test_docker_operations_require_their_own_approval_and_successful_prerequisite(self):
        stages = {s['stage']: s for s in pipeline_stages(azure_service_connection='acr-connection')}
        states = ('Succeeded', 'Pending', 'Failed', 'Skipped', 'Canceled', 'SucceededWithIssues', '')
        for action, prerequisite, job_name in (
                ('version', 'emulator_container_validate', 'container'),
                ('latest', 'Prod_emulator_container_version_publish', 'publish')):
            approval_name = f'Prod_emulator_container_{action}_approve'
            approve = stages[approval_name]
            self.assertEqual(approve['displayName'], f'Release Docker {action}')
            self.assertEqual(approve['trigger'], 'manual')
            self.assertIs(approve['isSkippable'], True)
            self.assertNotIn('dependsOn', approve)
            self.assertNotIn('stageDependencies.', json.dumps(approve))
            gate = approve['jobs'][0]
            self.assertEqual(gate['pool'], {'type': 'server'})
            check = gate['steps'][0]
            self.assertEqual(check['task'], 'ManualValidation@1')
            self.assertEqual(check['timeoutInMinutes'], 1440)
            self.assertGreater(gate['timeoutInMinutes'], check['timeoutInMinutes'])
            self.assertEqual(check['inputs']['onTimeout'], 'reject')
            self.assertIs(check['inputs']['allowApproversToApproveTheirOwnRuns'], True)
            self.assertIn('drop_emulator_container/container-release.json', check['inputs']['instructions'])
            publish = stages[f'Prod_emulator_container_{action}_publish']
            self.assertEqual(dependencies(publish), [prerequisite, approval_name])
            self.assertEqual(publish['variables']['ob_release_environment'], 'Production')
            self.assertEqual(publish['lockBehavior'], 'sequential')
            publisher = publish['jobs'][0]
            self.assertEqual(publisher['pool'], {'type': 'release', 'os': 'linux'})
            self.assertEqual(publisher['variables']['prerequisiteResult'], f'$[ stageDependencies.{prerequisite}.{job_name}.result ]')
            self.assertIn(job_name, [job['job'] for job in stages[prerequisite]['jobs']])
            self.assertEqual(publisher['templateContext']['inputs'][0]['artifactName'], 'drop_emulator_container')
            self.assertNotIn('checkout', json.dumps(publisher))
            steps = publisher['steps']
            tasks = [step['task'] for step in steps]
            expected_tasks = ['PowerShell@2', 'Docker@1', 'PowerShell@2']
            if action == 'version':
                expected_tasks = ['PowerShell@2', 'ContainerSecuritySetup@2', 'Docker@1',
                                  'ContainerSecurityCopyImage@2', 'ContainerSecurityCopyImage@2', 'PowerShell@2']
                load, push = steps[3:5]
                self.assertEqual(load['inputs']['sourceType'], 'tarball')
                self.assertEqual(load['inputs']['targetType'], 'ociLayout')
                self.assertEqual(push['inputs']['sourceType'], 'ociLayout')
                self.assertEqual(push['inputs']['targetType'], 'remoteImage')
                self.assertEqual(load['inputs']['targetOciLayout'], push['inputs']['sourceOciLayout'])
            self.assertEqual(tasks, expected_tasks)
            self.assertIn('-Phase Prepare', steps[0]['inputs']['arguments'])
            login = next(step for step in steps if step['task'] == 'Docker@1')
            self.assertEqual(login['inputs']['azureSubscriptionEndpoint'], 'acr-connection')
            self.assertEqual(login['inputs']['command'], 'login')
            self.assertEqual(steps[-1]['env']['DOCKER_CONFIG'], '$(DOCKER_CONFIG)')
            self.assertIn(f'-Action {action}', steps[-1]['inputs']['arguments'])
            for step in steps:
                self.assertNotIn('continueOnError', step)
                self.assertNotIn('condition', step)
            self.assertNotIn('${{', json.dumps(publish))
            for branch, reason, result, approval in itertools.product(
                    ('refs/heads/main', 'refs/heads/release/1.0', 'refs/heads/topic'),
                    ('Manual', 'IndividualCI', 'BatchedCI'), states, states):
                values = context(branch, reason) | {
                    f'dependencies.{prerequisite}.result': result,
                    f'dependencies.{approval_name}.result': approval,
                }
                self.assertEqual(evaluate(publish['condition'], values),
                                 branch != 'refs/heads/topic' and result == approval == 'Succeeded')
                self.assertFalse(evaluate(publish['condition'], values, canceled=True))
            for state in states:
                self.assertEqual(evaluate(publisher['condition'], {"variables['prerequisiteResult']": state}), state == 'Succeeded')
                self.assertFalse(evaluate(publisher['condition'], {"variables['prerequisiteResult']": state}, canceled=True))

    def test_optional_latest_does_not_block_version_packages_or_ci(self):
        stages = {s['stage']: s for s in pipeline_stages(azure_service_connection='acr-connection')}
        latest = {'Prod_emulator_container_latest_approve', 'Prod_emulator_container_latest_publish'}
        docker = {name for name in stages if 'emulator_container' in name}
        for name, stage in stages.items():
            if name not in latest:
                self.assertTrue(set(dependencies(stage)).isdisjoint(latest))
            if name not in docker:
                self.assertTrue(set(dependencies(stage)).isdisjoint(docker))
        for reason in ('IndividualCI', 'BatchedCI', 'Manual'):
            values = context(reason=reason)
            ran = set()
            for name, stage in stages.items():
                allowed = stage.get('trigger') != 'manual' and evaluate(stage['condition'], values)
                values[f'dependencies.{name}.result'] = 'Succeeded' if allowed else 'Skipped'
                if allowed:
                    ran.add(name)
            self.assertEqual(ran, {'emulator_build', 'emulator_myget', 'emulator_container_build', 'emulator_container_validate',
                                   *(f'{key}_build' for key in NPM_KEYS)})
        for state in ('Pending', 'Skipped', 'Failed', 'Canceled', 'SucceededWithIssues', ''):
            values = context()
            for name in docker:
                values[f'dependencies.{name}.result'] = state
            for key in RELEASE_KEYS:
                self.assertTrue(permits_job(f'{key}_publish', values))
            values['dependencies.emulator_container_validate.result'] = 'Succeeded'
            values['dependencies.Prod_emulator_container_version_approve.result'] = 'Succeeded'
            self.assertTrue(evaluate(stages['Prod_emulator_container_version_publish']['condition'], values))
            # An early latest approval still cannot bypass incomplete version publication.
            values['dependencies.Prod_emulator_container_latest_approve.result'] = 'Succeeded'
            self.assertFalse(evaluate(stages['Prod_emulator_container_latest_publish']['condition'], values))

    def test_package_builds_and_releases_need_no_runtime_switches(self):
        self.assertEqual(DEFAULT_PARAMETERS, {})
        self.assertNotIn('parameters', PIPELINE)
        self.assertNotIn('publish_package', {p['name'] for p in TEMPLATE['parameters']})
        self.assertEqual([e['parameters']['package_key'] for e in NPM_BUILD_ENTRIES], list(NPM_KEYS))
        self.assertIs(PIPELINE['trigger']['batch'], True)
        self.assertEqual(PIPELINE['trigger']['branches']['include'], ['main'])
        self.assertEqual(PIPELINE['pr'], 'none')
        self.assertNotIn('paths', PIPELINE['trigger'])
        self.assertEqual({name for name, stage in STAGES.items() if stage.get('trigger') == 'manual'},
                         set(MANUAL_STAGES))

    def test_release_templates_resolve_to_concrete_stages_and_jobs(self):
        self.assertEqual(len(EXPANDED_STAGES), len(STAGES), 'Stage names must be unique')
        for name in RELEASE_STAGES:
            self.assertNotIn('"template":', json.dumps(STAGES[name]))
            self.assertNotIn('${{', json.dumps(STAGES[name]))
        for key in RELEASE_KEYS:
            self.assertEqual([job['job'] for job in STAGES[f'Prod_{key}_approve']['jobs']],
                             [f'{key}_approve'])
            self.assertEqual([job['job'] for job in STAGES[JOB_STAGES[f'{key}_publish']]['jobs']],
                             [f'{key}_publish'])

    def test_stage_and_release_job_graphs(self):
        self.assertEqual(len(STAGES), 20)
        self.assertEqual(len(RELEASE_JOBS), 9)
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
        for name, stage in STAGES.items():
            self.assertIs(stage['isSkippable'], name in MANUAL_STAGES)
        for key in RELEASE_KEYS:
            self.assertNotIn('dependsOn', STAGES[f'Prod_{key}_approve'])
            self.assertNotIn('stageDependencies.', json.dumps(STAGES[f'Prod_{key}_approve']))
            self.assertEqual(dependencies(RELEASE_JOBS[f'{key}_approve']), [])
        for key in NPM_KEYS:
            approve, publish = f'Prod_{key}_approve', f'Prod_{key}_publish'
            self.assertEqual(dependencies(STAGES[publish]), [f'{key}_build', approve])
            self.assertEqual(dependencies(STAGES[f'{key}_release_finalize']),
                             [f'{key}_build', approve, publish])
        seen = set()
        for name, stage in STAGES.items():
            self.assertTrue(set(dependencies(stage)) <= seen)
            seen.add(name)

    def test_main_ci_finishes_without_starting_release_approvals(self):
        for reason in ('IndividualCI', 'BatchedCI'):
            values = context(reason=reason)
            ran = set()
            for name in STAGES:
                allowed = STAGES[name].get('trigger') != 'manual' and permits(name, values)
                values[f'dependencies.{name}.result'] = 'Succeeded' if allowed else 'Skipped'
                if allowed:
                    ran.add(name)
            self.assertEqual(ran, {'emulator_build', 'emulator_myget',
                                   'emulator_container_build', 'emulator_container_validate',
                                   *(f'{key}_build' for key in NPM_KEYS)})
            for name in RELEASE_JOBS:
                # Trigger selection is separate from condition eligibility.
                # The approval stage can be started manually; no other release job can run yet.
                if not name.endswith('_approve'):
                    self.assertFalse(permits_job(name, values))
        self.assertTrue(PIPELINE['extends']['parameters']['featureFlags']['use1esentry'])
        for name, stage in STAGES.items():
            if name not in RELEASE_STAGES and not name.startswith('Prod_emulator_container_'):
                self.assertTrue(set(dependencies(stage)).isdisjoint(RELEASE_STAGES))
                for forbidden in ('ManualValidation@1', 'EsrpRelease@11', 'git push', 'Npm-Release.mjs bump'):
                    self.assertNotIn(forbidden, json.dumps(stage), name)

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
                    self.assertIn(job['pool'], ({'type': 'linux'}, {'type': 'docker', 'os': 'linux'}))
        for key in NPM_KEYS:
            job = RELEASE_JOBS[f'{key}_finalize']
            self.assertEqual(job['pool'], {'type': 'linux'})
            self.assertEqual(job['steps'][0]['checkout'], 'self')
            self.assertIs(job['steps'][0]['persistCredentials'], True)
            self.assertNotIn('ref', job['steps'][0])
            self.assertIs(job['steps'][0]['fetchTags'], True)

    def test_cross_stage_output_bindings_reference_real_direct_dependencies(self):
        pattern = re.compile(r"\$\[ stageDependencies\.(\w+)\.(\w+)\.(result|outputs\['([^']+)'\]) \]")
        for name in RELEASE_STAGES:
            for match in pattern.finditer(json.dumps(STAGES[name])):
                stage_name, job_name, kind, output = match.groups()
                self.assertIn(stage_name, dependencies(STAGES[name]))
                job = next(job for job in STAGES[stage_name]['jobs'] if job['job'] == job_name)
                if output:
                    self.assertEqual(output.split('.')[0], 'read')
                    self.assertIn('read', [step.get('name') for step in job['steps']])
                    key = stage_name.removesuffix('_build')
                    self.assertIn(key, PACKAGE_KEYS)
                    self.assertIn(output, (f'read.{key}_releaseVersion', f'read.{key}_productState'))

    def test_version_checks_run_first_in_each_build_without_history_or_readiness_tracking(self):
        self.assertNotIn('release_check', STAGES)
        for key in PACKAGE_KEYS:
            stage = STAGES[f'{key}_build']
            job = stage['jobs'][0]
            self.assertEqual(job['job'], 'build')
            self.assertEqual(dependencies(stage), [])
            steps = job['steps']
            self.assertEqual(steps[0]['checkout'], 'self')
            self.assertEqual(steps[1]['task'], 'UseNode@1')
            check = steps[2]
            self.assertEqual(check['name'], 'read')
            self.assertEqual(check['task'], 'Bash@3')
            self.assertEqual(check['inputs']['script'],
                             f'set -euo pipefail\nnode .pipelines/scripts/Get-ReleasePackages.mjs {key}\n')
            self.assertEqual(check['inputs']['workingDirectory'], '$(Pipeline.Workspace)/s/azure-webpubsub')
            self.assertNotIn('condition', check)
            self.assertNotIn('continueOnError', check)
            self.assertNotIn('continueOnError', job)
            if key in NPM_KEYS:
                locate = next(step for step in steps if step.get('name') == 'locate')
                self.assertIn(f'"$packed_version" != "$(read.{key}_releaseVersion)"', locate['inputs']['script'])
                self.assertNotIn('$(releaseVersion)', locate['inputs']['script'])
                self.assertNotIn('stageDependencies.', json.dumps(stage))
        for filename in ('Get-ReadyNpmRelease.mjs', 'Get-ReadyNpmRelease.test.mjs'):
            self.assertFalse((ROOT / '.pipelines/scripts' / filename).exists())
        helper = (ROOT / '.pipelines/scripts/Get-ReleasePackages.mjs').read_text(encoding='utf-8')
        for forbidden in ('needsRelease', 'anyChanged', 'Get-ReadyNpmRelease', 'drop_release_source',
                          'findAutomaticBaseline', 'createAdoClient', 'SYSTEM_ACCESSTOKEN'):
            self.assertNotIn(forbidden, helper + json.dumps(PIPELINE))
        for forbidden in ('node:child_process', 'fetch(', 'BUILD_SOURCEVERSION', 'SYSTEM_COLLECTIONURI'):
            self.assertNotIn(forbidden, helper)

    def test_branch_eligibility_and_manual_feature_branches(self):
        # Build 182347591: a successful manual build on this feature branch must reach approval.
        cases = [('refs/heads/main', 'IndividualCI', True),
                 ('refs/heads/main', 'BatchedCI', True),
                 ('refs/heads/main', 'Manual', True),
                 ('refs/heads/release/1.0', 'Manual', True),
                 ('refs/heads/release/1.0', 'IndividualCI', False),
                 ('refs/heads/vicancy/vicancy-fix-emulator-publish-runtime', 'Manual', True),
                 ('refs/heads/vicancy/vicancy-fix-emulator-publish-runtime', 'IndividualCI', False),
                 ('refs/heads/topic', 'Manual', True),
                 ('refs/heads/topic', 'BatchedCI', False),
                 ('refs/pull/1/merge', 'PullRequest', False)]
        for branch, reason, eligible in cases:
            with self.subTest(branch=branch, reason=reason):
                values = context(branch, reason)
                for key in PACKAGE_KEYS:
                    self.assertEqual(permits(f'{key}_build', values), eligible)
                for key in RELEASE_KEYS:
                    self.assertEqual(permits(f'Prod_{key}_approve', values), eligible)
                self.assertEqual(permits('emulator_myget', values), eligible)

    def test_builds_are_independent_and_release_gates_fail_closed(self):
        states = ('Skipped', 'Failed', 'Canceled', 'SucceededWithIssues', 'Pending', '')
        for key in PACKAGE_KEYS:
            self.assertEqual(STAGES[f'{key}_build']['dependsOn'], [])
            self.assertTrue(permits(f'{key}_build', context()))
        for result in ('Succeeded', *states):
            values = context()
            values['dependencies.emulator_build.result'] = result
            self.assertEqual(permits('emulator_myget', values), result == 'Succeeded')
        for key, result in itertools.product(PACKAGE_KEYS, states):
            values = context()
            values[f'dependencies.{key}_build.result'] = result
            for other in PACKAGE_KEYS:
                if other != key:
                    self.assertTrue(permits(f'{other}_build', values))
                if other in RELEASE_KEYS:
                    self.assertEqual(permits(f'Prod_{other}_publish', values), other != key)

    def test_rejected_or_incomplete_approval_blocks_only_its_package(self):
        for key in RELEASE_KEYS:
            for result in ('Skipped', 'Failed', 'Canceled', 'SucceededWithIssues', 'Pending', ''):
                values = context()
                values[f'dependencies.Prod_{key}_approve.result'] = result
                for other in RELEASE_KEYS:
                    self.assertTrue(permits_job(f'{other}_approve', values))
                    for suffix in ('publish', 'finalize'):
                        self.assertEqual(permits_job(f'{other}_{suffix}', values), other != key,
                                         (key, result, other, suffix))

    def test_myget_and_public_releases_have_no_dependency_on_each_other(self):
        self.assertEqual(dependencies(STAGES['emulator_myget']), ['emulator_build'])
        for name in RELEASE_STAGES:
            self.assertNotIn('emulator_myget', dependencies(STAGES[name]))
        for state in ('Succeeded', 'Skipped', 'Failed', 'Canceled', 'Pending', 'SucceededWithIssues', ''):
            values = context()
            values['dependencies.emulator_myget.result'] = state
            for key in RELEASE_KEYS:
                self.assertTrue(permits_job(f'{key}_approve', values))
                self.assertTrue(permits_job(f'{key}_publish', values))
            for name in RELEASE_STAGES:
                values[f'dependencies.{name}.result'] = state
            self.assertTrue(permits('emulator_myget', values))

    def test_publication_requires_approval_and_build_and_finalize_requires_publication(self):
        states = ('Succeeded', 'Failed', 'Canceled', 'Skipped', 'Pending', 'SucceededWithIssues', '')
        for key in RELEASE_KEYS:
            for approval, build_stage, build_job in itertools.product(states, repeat=3):
                values = context()
                values[f'dependencies.Prod_{key}_approve.result'] = approval
                values[f'dependencies.{key}_build.result'] = build_stage
                values[f'stageDependencies.{key}_build.build.result'] = build_job
                self.assertEqual(permits_job(f'{key}_publish', values), approval == build_stage == build_job == 'Succeeded')
            for build, publish_stage, publish_job in itertools.product(states, repeat=3):
                values = context()
                values[f'dependencies.{key}_build.result'] = build
                values[f'dependencies.Prod_{key}_publish.result'] = publish_stage
                values[f'stageDependencies.Prod_{key}_publish.{key}_publish.result'] = publish_job
                self.assertEqual(permits_job(f'{key}_finalize', values), build == publish_stage == publish_job == 'Succeeded')

    def test_packages_have_independent_dependency_chains(self):
        def ancestors(name):
            return {name} | {item for dep in dependencies(STAGES[name]) for item in ancestors(dep)}

        for key in RELEASE_KEYS:
            chain = ancestors(f'{key}_release_finalize')
            self.assertIn(f'Prod_{key}_approve', chain)
            self.assertIn(f'{key}_build', chain)
            for other in RELEASE_KEYS:
                if other != key:
                    self.assertNotIn(f'Prod_{other}_approve', chain)
                    self.assertNotIn(f'{other}_build', chain)
                    self.assertNotIn(JOB_STAGES[f'{other}_publish'], chain)
            for result in ('Failed', 'Pending', 'Skipped', 'Canceled'):
                values = context()
                for name, stage in STAGES.items():
                    if name not in chain:
                        values[f'dependencies.{name}.result'] = result
                        for job in stage['jobs']:
                            values[f"stageDependencies.{name}.{job['job']}.result"] = result
                self.assertTrue(permits_job(f'{key}_approve', values))
                self.assertTrue(permits_job(f'{key}_publish', values))
                self.assertTrue(permits_job(f'{key}_finalize', values))

    def test_cancellation_blocks_every_stage_and_release_job(self):
        for name in STAGES:
            self.assertFalse(permits(name, context(), canceled=True), name)
        for name in RELEASE_JOBS:
            self.assertFalse(permits_job(name, context(), canceled=True), name)

    def test_agentless_approval_for_each_package(self):
        for key in RELEASE_KEYS:
            stage = STAGES[f'Prod_{key}_approve']
            self.assertEqual(stage['variables']['ob_release_environment'], 'Test')
            job = RELEASE_JOBS[f'{key}_approve']
            self.assertEqual(job['pool'], {'type': 'server'})
            self.assertEqual(job['timeoutInMinutes'], 1500)
            self.assertEqual(stage['trigger'], 'manual')
            self.assertNotIn('variables', job)
            step = job['steps'][0]
            self.assertEqual(step['task'], 'ManualValidation@1')
            self.assertEqual(step['timeoutInMinutes'], 1440)
            self.assertEqual(step['inputs']['onTimeout'], 'reject')
            self.assertEqual(step['inputs']['notifyUsers'], '')
            self.assertIs(step['inputs']['allowApproversToApproveTheirOwnRuns'], True)
            self.assertNotIn('approvers', step['inputs'])
            instructions = step['inputs']['instructions']
            for detail in ('$(Build.BuildNumber)', '$(Build.SourceBranch)', '$(Build.SourceVersion)', 'Reject'):
                self.assertIn(detail, instructions)

    def test_public_npm_publishers_keep_their_production_classification(self):
        for key in NPM_KEYS:
            stage = STAGES[f'Prod_{key}_publish']
            self.assertEqual(stage['variables']['ob_release_environment'], 'Production')
            self.assertIn(f'Prod_{key}_approve', dependencies(stage))
            self.assertEqual(RELEASE_JOBS[f'{key}_publish']['pool']['type'], 'release')

    def test_manual_release_reuses_same_run_artifacts_without_building(self):
        build_packages = {e['parameters']['package_key']: e['parameters'] for e in NPM_BUILD_ENTRIES}
        for key, package in build_packages.items():
            build = STAGES[f'{key}_build']['jobs'][0]
            publish = RELEASE_JOBS[f'{key}_publish']
            artifact_root = f'$(Pipeline.Workspace)/esrp-release/$(Build.BuildId)/{key}'
            self.assertEqual(publish['pool'], {'type': 'release', 'os': 'windows'})
            self.assertEqual(publish['templateContext']['inputs'], [{
                'input': 'pipelineArtifact',
                'artifactName': build['variables']['ob_artifactBaseName'],
                'targetPath': artifact_root,
            }])
            for variable in ('releaseVersion', 'productState'):
                self.assertEqual(publish['variables'][variable],
                                 f"$[ stageDependencies.{key}_build.build.outputs['read.{key}_{variable}'] ]")
            steps = publish['steps']
            self.assertEqual([step['task'] for step in steps], ['UseNode@1', 'PowerShell@2', 'EsrpRelease@11'])
            self.assertEqual(steps[-1]['inputs']['FolderLocation'], artifact_root + '/npm')
            self.assertEqual(steps[-1]['inputs']['ContentType'], 'npm')
            self.assertEqual(steps[-1]['inputs']['ConnectedServiceName'], '$(ESRP_SERVICE_CONNECTION)')
            check_script = steps[1]['inputs']['script']
            self.assertIn(f"& node '{artifact_root}/release/Npm-Release.mjs' check", check_script)
            self.assertIn(f"'{artifact_root}/npm'", check_script)
            self.assertIn("'$(releaseVersion)'", check_script)
            self.assertIn("if ($LASTEXITCODE -ne 0) { throw", check_script)
            for field in ('npm_package_name', 'package_name'):
                self.assertIn(f"'{package[field]}'", check_script)
            locate = next(step for step in build['steps'] if step.get('name') == 'locate')['inputs']['script']
            self.assertIn('cp "$tarball_path" "$(ob_outputDirectory)/npm/"', locate)
            self.assertIn('Npm-Release.mjs\' "$(ob_outputDirectory)/release/"', locate)
            finalize = RELEASE_JOBS[f'{key}_finalize']
            self.assertEqual([step.get('task', 'checkout') for step in finalize['steps']],
                             ['checkout', 'UseNode@1', 'Bash@3', 'Bash@3'])
            tag_script = finalize['steps'][2]['inputs']['script']
            self.assertIn(f'tag="release/{package["package_name"]}/v$(releaseVersion)"', tag_script)
            pr_script = finalize['steps'][3]['inputs']['script']
            self.assertIn(f"PACKAGE_FOLDER='{package['package_folder']}'", pr_script)
            self.assertIn(f"PACKAGE_NAME='{package['package_name']}'", pr_script)
            for job in (publish, finalize):
                self.assertNotIn('continueOnError', job)
                for step in job['steps']:
                    # Default succeeded() blocks publication on check failure and PR creation on tag failure.
                    self.assertNotIn('condition', step)
                    self.assertNotIn('continueOnError', step)
                scripts = '\n'.join(step.get('inputs', {}).get('script', '') for step in job['steps'])
                self.assertNotRegex(scripts, r'\b(?:yarn\s|npm\s+(?:run|pack)\b)')
                self.assertNotIn('Build-EmulatorPackage.ps1', scripts)
            self.assertEqual(finalize['pool'], {'type': 'linux'})

    def test_emulator_checkout_precedes_onebranch_signing_setup(self):
        self.assertIs(PIPELINE['extends']['parameters']['featureFlags']['linuxEsrpSigning'], True)
        steps = STAGES['emulator_build']['jobs'][0]['steps']
        checkouts = [step for step in steps if 'checkout' in step]
        self.assertEqual(checkouts, [steps[0]])
        self.assertEqual(steps[0]['checkout'], 'self')
        self.assertEqual(steps[0]['path'], 's/azure-webpubsub')
        self.assertIs(steps[0]['persistCredentials'], False)
        self.assertIs(steps[0].get('env', {}).get('ob_restore_phase'), True)
        restore_steps = [step for step in steps if step.get('env', {}).get('ob_restore_phase')]
        self.assertEqual(restore_steps, checkouts)

    def test_emulator_sign_pack_validate_order_and_artifacts(self):
        build = STAGES['emulator_build']['jobs'][0]
        self.assertEqual(build['pool']['type'], 'linux')
        self.assertEqual(build['variables']['ob_artifactBaseName'], 'drop_emulator')
        steps = build['steps']
        self.assertEqual(steps[3]['task'], 'UseDotNet@2')
        self.assertIs(steps[3]['inputs']['useGlobalJson'], True)
        sdk = json.loads((ROOT / 'tools/emulator/global.json').read_text(encoding='utf-8'))
        self.assertEqual(sdk['sdk']['version'], '10.0.401')
        scripts = [s['inputs']['script'] for s in steps if s.get('task') == 'PowerShell@2']
        self.assertEqual(len(scripts), 3)
        self.assertEqual(sum(s.count('-Phase Build') for s in scripts), 1)
        self.assertIn('-ReleaseVersion -Phase Build', scripts[0])
        self.assertEqual(scripts[1].count('-Phase Pack'), 2)
        self.assertIn('/release', scripts[1])
        self.assertIn('/preview', scripts[1])
        self.assertIn('-ReleaseVersion -Phase Validate', scripts[2])
        self.assertEqual(scripts[2].count('-Phase Validate'), 2)
        sequence = [s.get('task') for s in steps[4:]]
        self.assertEqual(sequence, ['PowerShell@2', 'onebranch.pipeline.signing@1', 'PowerShell@2', 'PowerShell@2'])
        self.assertEqual(steps[5]['inputs']['files_to_sign'], 'obj/Release/*/Microsoft.Azure.WebPubSub.Emulator.dll')
        script = (ROOT / '.pipelines/scripts/Build-EmulatorPackage.ps1').read_text(encoding='utf-8')
        self.assertIn('--configuration Release --no-build --no-restore --output', script)
        self.assertIn('$version = "$version-preview-$BuildId"', script)
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

    def test_npm_pack_commands_and_shallow_version_checkout(self):
        packages = {e['parameters']['package_key']: e['parameters'] for e in NPM_BUILD_ENTRIES}
        for key, package in packages.items():
            checkout = STAGES[f'{key}_build']['jobs'][0]['steps'][0]
            self.assertEqual(checkout['fetchDepth'], 1)
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



    def test_manual_approval_cannot_bypass_a_failed_or_incomplete_build(self):
        states = ('Succeeded', 'Pending', 'Failed', 'Skipped', 'Canceled', 'SucceededWithIssues', '')
        for key in RELEASE_KEYS:
            following = f'Prod_{key}_publish'
            for build, approval in itertools.product(states, repeat=2):
                values = context()
                values[f'dependencies.{key}_build.result'] = build
                values[f'dependencies.Prod_{key}_approve.result'] = approval
                self.assertEqual(permits(following, values),
                                 build == approval == 'Succeeded')

    def test_only_the_selected_release_chain_can_continue(self):
        for key in RELEASE_KEYS:
            for approval in ('Pending', 'Succeeded', 'Failed', 'Skipped'):
                values = context()
                for other in RELEASE_KEYS:
                    values[f'dependencies.Prod_{other}_approve.result'] = approval if other == key else 'Skipped'
                for other in RELEASE_KEYS:
                    following = f'Prod_{other}_publish'
                    self.assertEqual(permits(following, values), other == key and approval == 'Succeeded')


if __name__ == '__main__':
    unittest.main()
