import { spawnSync } from 'child_process';

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const isDryRun = args.includes('--dry-run');

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const gitCommand = process.platform === 'win32' ? 'git.exe' : 'git';

run(npxCommand, ['standard-version', '-a', ...args]);

if (isDryRun) {
  console.log('ℹ️ Dry run detected, skipping git push.');
  process.exit(0);
}

run(gitCommand, ['push', 'origin', 'HEAD', '--follow-tags']);