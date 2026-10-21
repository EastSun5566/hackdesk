import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { checkPackagedContents } from './check-packaged-contents';

const packagerRequire = createRequire(createRequire(import.meta.resolve('electron-builder')).resolve('app-builder-lib'));
const { createPackage, getRawHeader } = packagerRequire('@electron/asar') as {
  createPackage(source: string, destination: string): Promise<void>;
  getRawHeader(archive: string): { headerSize: number };
};
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function fixture(extra: Record<string, string> = {}, omit?: string) {
  const root = await mkdtemp(join(tmpdir(), 'hackdesk-asar-'));
  temporary.push(root);
  const source = join(root, 'source');
  const resources = join(root, 'resources');
  const files = {
    'electron/dist/main.cjs': 'main', 'electron/dist/preload.cjs': 'preload',
    'electron/dist/quick-capture-preload.cjs': 'quick', 'dist/index.html': '<html></html>',
    'electron/dist/third-party/packages.json': JSON.stringify([{ name: 'example', version: '1', files: ['example/LICENSE'] }]),
    'electron/dist/third-party/example/LICENSE': 'Original license', LICENSE: 'Project license', ...extra,
  };
  let payloadBytes = 0;
  for (const [name, value] of Object.entries(files)) {
    if (name === omit) continue;
    payloadBytes += Buffer.byteLength(value);
    await mkdir(dirname(join(source, name)), { recursive: true });
    await writeFile(join(source, name), value);
  }
  await mkdir(join(resources, 'assets'), { recursive: true });
  await writeFile(join(resources, 'assets/icon.png'), 'icon');
  const archive = join(resources, 'app.asar');
  await createPackage(source, archive);
  // createPackage resolves before its write stream flushes, so wait for the whole archive.
  const size = 8 + getRawHeader(archive).headerSize + payloadBytes;
  for (let attempt = 0; attempt < 200 && (await stat(archive)).size < size; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return resources;
}

it('reads a real ASAR and verifies bundles, renderer, icon and licenses', async () => {
  const result = await checkPackagedContents(await fixture());
  expect(result.files).toBe(7);
  expect(result.nodeModulesBytes).toBe(0);
  expect(result.asarBytes).toBeGreaterThan(result.payloadBytes);
});
it('requires an executable dictation helper when asked to', async () => {
  const resources = await fixture();
  await expect(checkPackagedContents(resources, { requireSpeechHelper: true })).rejects.toThrow('Missing packaged dictation helper');
  await mkdir(join(resources, 'native'));
  await writeFile(join(resources, 'native/hackdesk-speech'), '#!/bin/sh\n', { mode: 0o755 });
  await expect(checkPackagedContents(resources, { requireSpeechHelper: true })).resolves.toMatchObject({ files: expect.any(Number) });
});

it('rejects copied npm files even when all bundles exist', async () => {
  await expect(checkPackagedContents(await fixture({ 'node_modules/example/index.js': 'duplicate' }))).rejects.toThrow('duplicate bundled dependencies');
});
it('rejects missing bundles and original license files', async () => {
  await expect(checkPackagedContents(await fixture({}, 'electron/dist/preload.cjs'))).rejects.toThrow('Missing packaged file');
  await expect(checkPackagedContents(await fixture({}, 'electron/dist/third-party/example/LICENSE'))).rejects.toThrow('Missing license');
});
it('also rejects npm files stored outside the ASAR', async () => {
  const resources = await fixture();
  await mkdir(join(resources, 'app.asar.unpacked/node_modules/example'), { recursive: true });
  await expect(checkPackagedContents(resources)).rejects.toThrow('Unpacked npm dependencies');
});
