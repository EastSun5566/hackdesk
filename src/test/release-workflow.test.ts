import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
const directories: string[] = [];

// Run the workflow's real shell scripts; only remote GitHub operations are faked.
function stepScript(name: string) {
  const lines = workflow.split('\n');
  const step = lines.findIndex((line) => line === `      - name: ${name}`);
  expect(step).toBeGreaterThanOrEqual(0);
  const start = lines.findIndex((line, index) => index > step && line.startsWith('        run: '));
  if (lines[start] !== '        run: |') return lines[start].slice('        run: '.length);
  const end = lines.findIndex((line, index) => index > start && !line.startsWith('          ') && line !== '');
  return lines.slice(start + 1, end === -1 ? undefined : end).map((line) => line.slice(10)).join('\n');
}

function fixture(version = '2.0.0-beta.7', state = 'missing') {
  const directory = mkdtempSync(join(tmpdir(), 'hackdesk-release-'));
  directories.push(directory);
  const channel = version.includes('-') ? version.split('-')[1].split('.')[0] : 'latest';
  mkdirSync(join(directory, 'artifacts'));
  const names = [
    ...['arm64.dmg', 'arm64.zip', 'x64.dmg', 'x64.zip', 'x64.exe', 'x86_64.AppImage', 'x64.exe.blockmap']
      .map((suffix) => `HackDesk-${version}-${suffix}`),
    `${channel}.yml`, `${channel}-mac.yml`, `${channel}-linux.yml`,
  ];
  for (const name of names) {
    writeFileSync(join(directory, 'artifacts', name), name.endsWith('.yml') ? `version: ${version}\n` : 'binary');
  }
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ version }));
  writeFileSync(join(directory, 'state'), state);
  writeFileSync(join(directory, 'names'), `${names.join('\n')}\n`);
  writeFileSync(join(directory, 'calls'), '');
  writeFileSync(join(directory, 'output'), '');
  writeFileSync(join(directory, 'gh'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> calls
case "$1 $2" in
  'release view')
    if [[ "$(cat state)" == missing ]]; then exit 1; fi
    case "$*" in
      *'.assets[].name'*) cat names ;;
      *'.assets | all'*) echo "\${MOCK_ASSETS_VALID:-true}" ;;
      *) cat state ;;
    esac ;;
  'release create')
    [[ "$*" == *--draft* && "$*" == *--verify-tag* ]]
    printf 'true false' > state ;;
  'release upload')
    test "$(cat state)" = 'true false'
    if [[ "\${MOCK_UPLOAD_FAILURE:-false}" == true ]]; then exit 1; fi
    printf '%s\\n' artifacts/* | sed 's|^artifacts/||' > names
    if [[ "\${MOCK_INCOMPLETE_UPLOAD:-false}" == true ]]; then sed -i.bak '1d' names; fi ;;
  'release edit')
    test "$(cat state)" = 'true false'
    [[ "$*" == *--draft=false* ]]
    if [[ "$*" == *--prerelease* ]]; then
      printf 'false true' > state
    else
      [[ "$*" == *--latest* ]]
      printf 'false false' > state
    fi ;;
  *) echo "Unexpected gh call: $*" >&2; exit 99 ;;
esac
`, { mode: 0o755 });
  const run = (step: string, env: NodeJS.ProcessEnv = {}) => spawnSync('bash', ['-e', '-o', 'pipefail', '-c', stepScript(step)], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${directory}${delimiter}${process.env.PATH}`,
      GITHUB_REPOSITORY: 'example/hackdesk',
      GITHUB_REF_NAME: `v${version}`,
      GITHUB_OUTPUT: join(directory, 'output'),
      RELEASE_CHANNEL: channel,
      RELEASE_NOTES: 'Release notes',
      ...env,
    },
  });
  return {
    directory, version, channel, run,
    read: (name: string) => readFileSync(join(directory, name), 'utf8'),
    publish: (env: NodeJS.ProcessEnv = {}) => {
      const upload = run('Validate assets and upload draft', env);
      if (upload.status !== 0) return upload;
      const publish = run(version.includes('-') ? 'Publish prerelease' : 'Publish stable release');
      return publish.status === 0 ? run('Verify published release state') : publish;
    },
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('tag release workflow', () => {
  it.each(['2.0.0-beta.7', '2.0.0-rc.1', '2.0.0'])('preserves %s release kind and publishes only verified draft assets', (version) => {
    const test = fixture(version);
    expect(test.run('Resolve release kind').status).toBe(0);
    expect(test.read('output')).toBe(`is_beta=${version.includes('-beta.')}\nchannel=${test.channel}\n`);
    const result = test.publish();
    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(test.read('state')).toBe(`false ${version.includes('-')}`);
    const calls = test.read('calls').split('\n');
    const create = calls.findIndex((call) => call.startsWith('release create'));
    const upload = calls.findIndex((call) => call.startsWith('release upload'));
    const verify = calls.findIndex((call) => call.includes('.assets | all'));
    const publish = calls.findIndex((call) => call.startsWith('release edit'));
    expect(create).toBeGreaterThan(0);
    expect(upload).toBeGreaterThan(create);
    expect(verify).toBeGreaterThan(upload);
    expect(publish).toBeGreaterThan(verify);
    expect(calls[publish]).toContain(version.includes('-') ? '--prerelease' : '--latest');
    expect(calls[publish]).toContain('--notes Release notes');
  });

  it.each(['missing', 'empty', 'wrong-version', 'unexpected'])('rejects %s local assets before GitHub writes', (defect) => {
    const test = fixture();
    const installer = join(test.directory, 'artifacts', `HackDesk-${test.version}-x64.exe`);
    if (defect === 'missing') rmSync(installer);
    if (defect === 'empty') writeFileSync(installer, '');
    if (defect === 'wrong-version') writeFileSync(join(test.directory, 'artifacts', 'beta.yml'), 'version: 0.1.5\n');
    if (defect === 'unexpected') writeFileSync(join(test.directory, 'artifacts', 'builder-debug.yml'), 'debug');
    expect(test.publish().status).not.toBe(0);
    expect(test.read('calls')).toBe('');
  });

  it.each([
    { MOCK_UPLOAD_FAILURE: 'true' },
    { MOCK_INCOMPLETE_UPLOAD: 'true' },
    { MOCK_ASSETS_VALID: 'false' },
  ])('keeps a failed upload private: %j', (env) => {
    const test = fixture();
    expect(test.publish(env).status).not.toBe(0);
    expect(test.read('state')).toBe('true false');
    expect(test.read('calls')).not.toContain('release edit');
  });

  it('reuses an unpublished draft on retry', () => {
    const test = fixture('2.0.0-beta.7', 'true false');
    expect(test.publish().status).toBe(0);
    expect(test.read('calls')).not.toContain('release create');
  });

  it.each(['false true', 'false false'])('refuses to overwrite a published release: %s', (state) => {
    const test = fixture('2.0.0-beta.7', state);
    expect(test.publish().status).not.toBe(0);
    expect(test.read('calls')).not.toMatch(/release (create|upload|edit)/);
  });

  it.each(['macOS', 'Windows'])('still rejects missing %s signing credentials', (platform) => {
    const test = fixture('2.0.0-rc.1');
    expect(test.run(`Verify ${platform} signing secrets`, {
      CSC_LINK: '', CSC_KEY_PASSWORD: '', APPLE_ID: '', APPLE_APP_SPECIFIC_PASSWORD: '', APPLE_TEAM_ID: '',
    }).status).not.toBe(0);
    expect(test.read('calls')).toBe('');
  });
});
