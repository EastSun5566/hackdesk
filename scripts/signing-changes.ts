import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Decides whether a CI run needs the Windows signing and installer test (about 2.5 minutes on the
// slowest job). It runs when a change touches what that test exercises: the SignPath scripts and
// configurations, the signing workflows, the installed-app startup spec, or the electron-builder
// setup that produces the installer.
const signingPaths = [
  /^scripts\/[^/]*signpath[^/]*$/,
  /^build\/signpath\//,
  /^\.github\/actions\/signpath-test-file\//,
  /^\.github\/workflows\/(build|windows-signpath-[^/]+)\.yml$/,
  /^electron\/e2e\/packaged-startup\.spec\.ts$/,
  /^electron\/playwright\.packaged\.config\.ts$/,
];

type PackageJson = { build?: unknown; devDependencies?: Record<string, string> };

export function signingChangeReason(files: string[], before: PackageJson, after: PackageJson): string | null {
  const file = files.find(path => signingPaths.some(pattern => pattern.test(path)));
  if (file) return `${file} changed`;
  if (JSON.stringify(before.build) !== JSON.stringify(after.build)) return 'the electron-builder config changed';
  if (before.devDependencies?.['electron-builder'] !== after.devDependencies?.['electron-builder']) {
    return 'the electron-builder version changed';
  }
  return null;
}

function git(...args: string[]) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

// Usage: node scripts/signing-changes.ts <base-sha> <head-sha>. Without a usable base (a manual
// run, or the first push of a branch) it always asks for the test.
function main([base, head]: string[]) {
  let reason: string | null;
  if (!base || /^0+$/.test(base) || !head) {
    reason = 'there is no base commit to compare with';
  } else {
    git('fetch', '--no-tags', '--depth=1', 'origin', base);
    const files = git('diff', '--name-only', base, head).split('\n').filter(Boolean);
    const readPackage = (sha: string) => JSON.parse(git('show', `${sha}:package.json`)) as PackageJson;
    reason = signingChangeReason(files, readPackage(base), readPackage(head));
  }
  console.log(reason ? `Signing test needed: ${reason}.` : 'No signing-related changes; skipping the signing test.');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `signing=${reason ? 'true' : 'false'}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
