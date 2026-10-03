import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const root = resolve(import.meta.dirname, '..');
const { productName, name, build } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const artifact = process.platform === 'darwin'
  ? join(process.arch === 'arm64' ? 'mac-arm64' : 'mac', `${productName}.app`)
  : process.platform === 'win32' ? join('win-unpacked', `${productName}.exe`) : join('linux-unpacked', name);
const appPath = process.argv[2] ?? join(root, build.directories.output, artifact);

// Use the fuse reader owned by our installed packager, without adding another dependency.
const builderRequire = createRequire(import.meta.resolve('electron-builder'));
const packagerRequire = createRequire(builderRequire.resolve('app-builder-lib'));
const { getCurrentFuseWire, FuseV1Options, FuseVersion } = packagerRequire('@electron/fuses');
const wire = await getCurrentFuseWire(appPath);
assert.equal(wire.version, FuseVersion.V1);
for (const option of ['RunAsNode', 'EnableNodeOptionsEnvironmentVariable', 'EnableNodeCliInspectArguments']) {
  assert.equal(wire[FuseV1Options[option]], '0'.charCodeAt(0), `${option} must be disabled in ${appPath}`);
}
console.log(`Packaged Electron fuses verified: ${appPath}`);
