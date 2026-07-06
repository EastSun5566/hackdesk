import { readFileSync } from 'fs';
import { spawnSync, type SpawnSyncReturns } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const isDryRun = args.includes('--dry-run');
const useNoVerify = args.includes('--no-verify');
const shouldSign = args.includes('--sign') || args.includes('-s');

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const gitCommand = process.platform === 'win32' ? 'git.exe' : 'git';
const releaseFiles = [
  'package.json',
  'CHANGELOG.md',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
];

type RunOptions = {
  captureOutput?: boolean;
};

function run(command: string, commandArgs: readonly string[], { captureOutput = false }: RunOptions = {}): SpawnSyncReturns<string> {
  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: captureOutput ? 'pipe' : 'inherit',
  });

  if (captureOutput) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }

    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
}

function readCurrentVersion() {
  return JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8')).version;
}

function parsePlannedVersion(output: string): string {
  const match = output.match(
    /bumping version in package\.json from [^\s]+ to ([^\s]+)/i
  );

  if (!match) {
    throw new Error(
      'Could not determine the next release version from standard-version dry-run output.'
    );
  }

  return match[1];
}

function buildGitCommitArgs(message: string): string[] {
  const commitArgs = ['commit'];

  if (useNoVerify) {
    commitArgs.push('--no-verify');
  }

  if (shouldSign) {
    commitArgs.push('-S');
  }

  commitArgs.push('-m', message, '--', ...releaseFiles);

  return commitArgs;
}

function buildGitTagArgs(tagName: string): string[] {
  return ['tag', shouldSign ? '-s' : '-a', tagName, '-m', tagName];
}

function logDryRunPlan(version: string): void {
  const tagName = `v${version}`;
  const commitMessage = `chore(release): ${tagName}`;

  console.log(`ℹ️ Dry run: would sync Cargo.toml and Cargo.lock to ${version}.`);
  console.log(
    `ℹ️ Dry run: would verify package.json, Cargo.toml, and Cargo.lock all use ${version}.`
  );
  console.log(`ℹ️ Dry run: would stage ${releaseFiles.join(', ')}.`);
  console.log(`ℹ️ Dry run: would create commit "${commitMessage}".`);
  console.log(
    `ℹ️ Dry run: would create ${shouldSign ? 'signed' : 'annotated'} tag "${tagName}".`
  );
  console.log('ℹ️ Dry run: would push origin HEAD --follow-tags.');
}

function main() {
  const standardVersionResult = run(
    npxCommand,
    ['standard-version', '--skip.commit', '--skip.tag', ...args],
    { captureOutput: true }
  );
  const combinedOutput = `${standardVersionResult.stdout ?? ''}${
    standardVersionResult.stderr ?? ''
  }`;
  const version = isDryRun
    ? parsePlannedVersion(combinedOutput)
    : readCurrentVersion();
  const tagName = `v${version}`;
  const commitMessage = `chore(release): ${tagName}`;

  if (isDryRun) {
    logDryRunPlan(version);
    return;
  }

  console.log(`ℹ️ Syncing Cargo release files to ${version}...`);
  run(process.execPath, ['scripts/sync-version.ts']);

  console.log('ℹ️ Verifying synchronized version files...');
  run(process.execPath, ['scripts/check-version.ts']);

  console.log('ℹ️ Staging release artifacts...');
  run(gitCommand, ['add', '--', ...releaseFiles]);

  console.log(`ℹ️ Creating release commit "${commitMessage}"...`);
  run(gitCommand, buildGitCommitArgs(commitMessage));

  console.log(`ℹ️ Creating tag "${tagName}"...`);
  run(gitCommand, buildGitTagArgs(tagName));

  console.log('ℹ️ Pushing release commit and tag...');
  run(gitCommand, ['push', 'origin', 'HEAD', '--follow-tags']);
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? `❌ Release failed: ${error.message}` : '❌ Release failed.'
  );
  process.exit(1);
}
