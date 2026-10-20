import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { access, constants, readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Read archives with the same library/version as our installed packager.
const builderRequire = createRequire(import.meta.resolve('electron-builder'));
const packagerRequire = createRequire(builderRequire.resolve('app-builder-lib'));
const asar = packagerRequire('@electron/asar') as { listPackage(path: string): string[]; statFile(path: string, name: string, followLinks?: boolean): { files?: unknown; link?: string; size: number }; extractFile(path: string, name: string): Buffer };

export function inspectArchive(archive: string) {
  let payloadBytes = 0;
  let nodeModulesBytes = 0;
  const files: string[] = [];
  for (const path of asar.listPackage(archive)) {
    // ASAR's reader expects native separators, but reports use portable paths.
    const nativePath = path.replace(/^[/\\]/, '');
    const entry = asar.statFile(archive, nativePath, false);
    if ('files' in entry || 'link' in entry) continue;
    const name = nativePath.split(sep).join('/');
    payloadBytes += entry.size;
    if (name.split('/').includes('node_modules')) nodeModulesBytes += entry.size;
    files.push(name);
  }
  return { files, payloadBytes, nodeModulesBytes };
}

/**
 * `requireSpeechHelper` is for macOS packages: electron-builder only warns when the dictation
 * helper is missing, so the artifact itself is checked.
 */
export async function checkPackagedContents(resources: string, { requireSpeechHelper = false } = {}) {
  const archive = join(resources, 'app.asar');
  const contents = inspectArchive(archive);
  assert(!contents.files.some(name => name.split('/').includes('node_modules')), 'Packaged npm files duplicate bundled dependencies');
  for (const file of ['electron/dist/main.cjs', 'electron/dist/preload.cjs', 'electron/dist/quick-capture-preload.cjs', 'dist/index.html', 'electron/dist/third-party/packages.json', 'LICENSE']) {
    assert(contents.files.includes(file), `Missing packaged file: ${file}`);
  }
  const notices = JSON.parse(asar.extractFile(archive, join('electron', 'dist', 'third-party', 'packages.json')).toString());
  assert(notices.length > 0, 'Third-party notices must not be empty');
  for (const pkg of notices) {
    for (const file of pkg.files) assert(contents.files.includes(`electron/dist/third-party/${file}`), `Missing license: ${file}`);
  }
  async function checkUnpacked(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    })) {
      assert(entry.name !== 'node_modules', 'Unpacked npm dependencies are not allowed');
      if (entry.isDirectory()) await checkUnpacked(join(directory, entry.name));
    }
  }
  await checkUnpacked(`${archive}.unpacked`);
  await access(join(resources, 'assets/icon.png'));
  if (requireSpeechHelper) {
    await access(join(resources, 'native/hackdesk-speech'), constants.X_OK).catch(() => {
      throw new Error('Missing packaged dictation helper: native/hackdesk-speech');
    });
  }
  return { asarBytes: (await stat(archive)).size, payloadBytes: contents.payloadBytes, nodeModulesBytes: contents.nodeModulesBytes, files: contents.files.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, '..');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const folder = process.platform === 'darwin'
    ? join(process.arch === 'arm64' ? 'mac-arm64' : 'mac', `${pkg.productName}.app`, 'Contents', 'Resources')
    : join(process.platform === 'win32' ? 'win-unpacked' : 'linux-unpacked', 'resources');
  const resources = process.argv[2] ?? join(root, pkg.build.directories.output, folder);
  console.log('Packaged contents verified:', await checkPackagedContents(resources, { requireSpeechHelper: process.platform === 'darwin' }));
}
