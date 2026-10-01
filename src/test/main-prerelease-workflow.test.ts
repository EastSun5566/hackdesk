import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/main-prerelease.yml', 'utf8');
const sourceSha = '1234567890abcdef1234567890abcdef12345678';
const buildVersion = '2.0.0-beta.main.g1234567890ab';
const directories: string[] = [];

// Execute the actual workflow scripts with GitHub calls replaced by a local fake.
function stepScript(name: string) {
  const lines = workflow.split('\n');
  const step = lines.findIndex((line) => line === `      - name: ${name}`);
  expect(step).toBeGreaterThanOrEqual(0);
  const start = lines.findIndex((line, index) => index > step && line === '        run: |') + 1;
  const end = lines.findIndex((line, index) => index >= start && !line.startsWith('          ') && line !== '');
  return lines.slice(start, end === -1 ? undefined : end).map((line) => line.slice(10)).join('\n');
}

function fixture(state = 'missing') {
  const directory = mkdtempSync(join(tmpdir(), 'hackdesk-main-release-'));
  directories.push(directory);
  mkdirSync(join(directory, 'artifacts'));
  const names = [
    ...['arm64.dmg', 'arm64.zip', 'x64.dmg', 'x64.zip', 'x64.exe', 'x86_64.AppImage', 'x64.exe.blockmap']
      .map((suffix) => `HackDesk-${buildVersion}-${suffix}`),
    'main.yml', 'main-mac.yml', 'main-linux.yml',
  ];
  for (const name of names) {
    writeFileSync(join(directory, 'artifacts', name), name.endsWith('.yml') ? `version: ${buildVersion}\n` : 'binary');
  }
  writeFileSync(join(directory, 'package.json'), '{"version":"2.0.0"}');
  writeFileSync(join(directory, 'state'), state);
  writeFileSync(join(directory, 'names'), `${names.join('\n')}\n`);
  writeFileSync(join(directory, 'calls'), '');
  writeFileSync(join(directory, 'output'), '');
  writeFileSync(join(directory, 'gh'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> calls
case "$1 $2" in
  'api --method') test "$3" = POST ;;
  'api '*actions/workflows*) echo "\${MOCK_CI_COUNT:-1}" ;;
  'api '*git/matching-refs*)
    if [[ "$(cat state)" != missing ]]; then echo "commit \${MOCK_TAG_SHA:-$SOURCE_SHA}"; fi ;;
  'release view')
    if [[ "$(cat state)" == missing ]]; then exit 1; fi
    case "$*" in
      *'.assets[].name'*) cat names ;;
      *'.assets | all'*) echo "\${MOCK_ASSETS_VALID:-true}" ;;
      *) cat state ;;
    esac ;;
  'release create')
    [[ "$*" == *--draft* && "$*" == *--prerelease* && "$*" == *--latest=false* ]]
    printf 'true true' > state ;;
  'release upload')
    test "$(cat state)" = 'true true'
    if [[ "\${MOCK_UPLOAD_FAILURE:-false}" == true ]]; then exit 1; fi
    printf '%s\\n' artifacts/* | sed 's|^artifacts/||' > names
    if [[ "\${MOCK_INCOMPLETE_UPLOAD:-false}" == true ]]; then sed -i.bak '1d' names; fi ;;
  'release edit')
    test "$(cat state)" = 'true true'
    [[ "$*" == *--draft=false* && "$*" == *--latest=false* ]]
    printf 'false true' > state ;;
  *) echo "Unexpected gh call: $*" >&2; exit 99 ;;
esac
`, { mode: 0o755 });
  return {
    directory,
    read: (name: string) => readFileSync(join(directory, name), 'utf8'),
    run: (step: string, env: Record<string, string> = {}) => spawnSync('bash', ['-e', '-o', 'pipefail', '-c', stepScript(step)], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}${delimiter}${process.env.PATH}`,
        GH_TOKEN: 'test-token',
        GITHUB_REPOSITORY: 'example/hackdesk',
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_OUTPUT: join(directory, 'output'),
        SOURCE_SHA: sourceSha,
        RELEASE_TAG: `main-${sourceSha}`,
        BUILD_VERSION: buildVersion,
        ...env,
      },
    }),
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('main prerelease workflow scripts', () => {
  it('requires successful CI for manual runs and identifies the exact commit', () => {
    const test = fixture();
    expect(test.run('Resolve verified source', { MOCK_CI_COUNT: '0' }).status).not.toBe(0);
    expect(test.read('output')).toBe('');
    expect(test.run('Resolve verified source').status).toBe(0);
    expect(test.read('output')).toBe(`source_sha=${sourceSha}\nrelease_tag=main-${sourceSha}\nbuild_version=${buildVersion}\n`);
    expect(test.read('calls')).toContain(`head_sha=${sourceSha}&status=success`);
  });

  it('publishes only after creating a draft, uploading and verifying all assets', () => {
    const test = fixture();
    const result = test.run('Verify assets and publish prerelease');
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(test.read('state')).toBe('false true');
    const calls = test.read('calls').split('\n');
    const create = calls.findIndex((call) => call.startsWith('release create'));
    const upload = calls.findIndex((call) => call.startsWith('release upload'));
    const verify = calls.findIndex((call) => call.includes('.assets | all'));
    const publish = calls.findIndex((call) => call.startsWith('release edit'));
    expect(create).toBeGreaterThan(0);
    expect(upload).toBeGreaterThan(create);
    expect(verify).toBeGreaterThan(upload);
    expect(publish).toBeGreaterThan(verify);
    expect(calls[create]).toContain(`--target ${sourceSha}`);
    expect(calls[0]).toContain(`main-${sourceSha}`);
  });

  it.each(['missing', 'empty', 'wrong-version', 'unexpected'])('rejects %s local assets before any GitHub write', (defect) => {
    const test = fixture();
    const installer = join(test.directory, 'artifacts', `HackDesk-${buildVersion}-x64.exe`);
    if (defect === 'missing') rmSync(installer);
    if (defect === 'empty') writeFileSync(installer, '');
    if (defect === 'wrong-version') writeFileSync(join(test.directory, 'artifacts', 'main.yml'), 'version: 0.1.5\n');
    if (defect === 'unexpected') writeFileSync(join(test.directory, 'artifacts', 'HackDesk-old-x64.exe'), 'old');
    expect(test.run('Verify assets and publish prerelease').status).not.toBe(0);
    expect(test.read('calls')).toBe('');
  });

  it.each([
    { MOCK_UPLOAD_FAILURE: 'true' },
    { MOCK_INCOMPLETE_UPLOAD: 'true' },
    { MOCK_ASSETS_VALID: 'false' },
  ])('keeps failed uploads private: %j', (env) => {
    const test = fixture();
    expect(test.run('Verify assets and publish prerelease', env).status).not.toBe(0);
    expect(test.read('state')).toBe('true true');
    expect(test.read('calls')).not.toContain('release edit');
  });

  it('retries an unpublished draft without replacing the release', () => {
    const test = fixture('true true');
    expect(test.run('Verify assets and publish prerelease').status).toBe(0);
    expect(test.read('calls')).not.toContain('release create');
    expect(test.read('state')).toBe('false true');
  });

  it.each([true, false])('never overwrites a published release, complete=%s', (complete) => {
    const test = fixture('false true');
    if (!complete) writeFileSync(join(test.directory, 'names'), 'main.yml\n');
    expect(test.run('Verify assets and publish prerelease').status === 0).toBe(complete);
    expect(test.read('calls')).not.toMatch(/release (create|upload|edit)|api --method/);
  });

  it('rejects a tag pointing to another commit before uploading', () => {
    const test = fixture('true true');
    expect(test.run('Verify assets and publish prerelease', { MOCK_TAG_SHA: 'bad-source' }).status).not.toBe(0);
    expect(test.read('calls')).not.toContain('release upload');
  });
});
