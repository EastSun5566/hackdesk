import { expect, it } from 'vitest';
import { signingChangeReason } from './signing-changes';

const packageJson = { build: { win: { target: ['nsis'] } }, devDependencies: { 'electron-builder': '^26.0.0' } };

it.each([
  'scripts/signpath-bridge.cjs',
  'scripts/test-signpath-installer.ps1',
  'scripts/verify-signpath-test.ps1',
  'build/signpath/windows-app-v1.xml',
  '.github/actions/signpath-test-file/action.yml',
  '.github/workflows/build.yml',
  '.github/workflows/windows-signpath-test.yml',
  'electron/e2e/packaged-startup.spec.ts',
  'electron/playwright.packaged.config.ts',
])('asks for the signing test when %s changes', file => {
  expect(signingChangeReason(['src/App.tsx', file], packageJson, packageJson)).toBe(`${file} changed`);
});

it('skips the signing test for changes unrelated to signing', () => {
  const files = ['src/App.tsx', 'electron/src/main/index.ts', 'scripts/electron-build.ts', '.github/workflows/release.yml'];
  expect(signingChangeReason(files, packageJson, { ...packageJson, version: '2.0.0' } as typeof packageJson)).toBeNull();
});

it('asks for the signing test when the electron-builder config or version changes', () => {
  expect(signingChangeReason(['package.json'], packageJson, { ...packageJson, build: { win: { target: ['zip'] } } }))
    .toBe('the electron-builder config changed');
  expect(signingChangeReason(['package.json'], packageJson, { ...packageJson, devDependencies: { 'electron-builder': '^27.0.0' } }))
    .toBe('the electron-builder version changed');
});
