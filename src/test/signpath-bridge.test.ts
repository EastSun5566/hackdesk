import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rename, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createBridge, expectedPaths, validateRequest, waitRequest, signingParameters, installerConfig } = require('../../scripts/signpath-bridge.cjs');
const directories: string[] = [];
const roles = ['app', 'elevate', 'uninstaller', 'installer'];
const names = ['HackDesk.exe', 'elevate.exe', 'Uninstall-HackDesk.exe', 'HackDesk-Installer.exe'];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
// Generous waits: a loaded CI runner can take over a second to write a request or a reply.
async function fixture(timeoutMs = 10_000) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'signpath-bridge-')));
  directories.push(root);
  const session = { root, output: join(root, 'output'), installer: join(root, 'output', 'HackDesk-test.exe'), nonce: 'run-1', certificateSha256: 'a'.repeat(64) };
  const paths: string[] = expectedPaths(session);
  for (const file of paths) { await mkdir(join(file, '..'), { recursive: true }); await writeFile(file, 'unsigned'); }
  const sign = createBridge(session, { timeoutMs, pollMs: 2 });
  async function reply(index: number, changes = {}, mutateInput = false) {
    const directory = join(root, roles[index]);
    const requestFile = join(directory, 'request.json');
    const deadline = Date.now() + 10_000;
    let request;
    while (!request) {
      try { request = JSON.parse(await readFile(requestFile, 'utf8')); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || Date.now() >= deadline) throw error;
        await new Promise(resolve => setTimeout(resolve, 2));
      }
    }
    await mkdir(join(directory, 'signed'), { recursive: true });
    await writeFile(join(directory, 'signed', names[index]), 'signed');
    if (mutateInput) await writeFile(paths[index], 'new unsigned input');
    const response = { ...request, status: 'Valid', certificateSha256: session.certificateSha256, signedSha256: hash('signed'), ...changes };
    await writeFile(join(directory, 'response.tmp'), JSON.stringify(response));
    await rename(join(directory, 'response.tmp'), join(directory, 'response.json'));
  }
  return { root, session, paths, sign, reply };
}
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe('SignPath builder bridge', () => {
  it('inherits package resources and fuses once while overriding only the test signing configuration', async () => {
    const builderRequire = createRequire(require.resolve('electron-builder'));
    const { getConfig } = builderRequire('app-builder-lib/out/util/config/config');
    const pkg = require('../../package.json');
    const test = await fixture();
    const config = await getConfig(process.cwd(), null, installerConfig(test.session, 'Fixture publisher'));
    expect(config.extraResources).toEqual(pkg.build.extraResources);
    expect(config.electronFuses).toEqual(pkg.build.electronFuses);
    expect(config.win.icon).toBe(pkg.build.win.icon);
    expect(config.win.signtoolOptions.signingHashAlgorithms).toEqual(['sha256']);
    expect(config.directories.output).toBe(test.session.output);
  });
  it('formats parameters as the pinned action requires, with no parameters for the helper', () => {
    expect(signingParameters('app', { productVersion: '2.0.0.0', fileVersion: '2.0.0-beta.5' }))
      .toBe('productVersion: "2.0.0.0"\nfileVersion: "2.0.0-beta.5"');
    expect(signingParameters('elevate', {})).toBe('');
    expect(signingParameters('installer', { productVersion: '2.0.0', fileVersion: 'value "quoted"' }))
      .toContain('fileVersion: "value \\"quoted\\""');
  });
  it.each(['', 'version\noutput=value', 'version\routput=value'])('rejects invalid version parameters: %j', version => {
    expect(() => signingParameters('app', { productVersion: version, fileVersion: '2.0.0' })).toThrow('Invalid PE version');
  });
  it('replaces each expected file only after its verified response, preserving evidence', async () => {
    const test = await fixture();
    const helperSource = join(test.root, 'toolset-elevate.exe');
    await writeFile(helperSource, 'unsigned');
    for (let index = 0; index < roles.length; index++) {
      const signing = test.sign(test.paths[index], { helperSource });
      expect(await readFile(test.paths[index], 'utf8')).toBe('unsigned');
      await test.reply(index);
      await signing;
      expect(await readFile(test.paths[index], 'utf8')).toBe('signed');
      expect(await readFile(join(test.root, roles[index], 'unsigned', names[index]), 'utf8')).toBe('unsigned');
    }
  });
  it.each([
    { nonce: 'previous-run' }, { id: 'different-request' }, { status: 'NotSigned' },
    { certificateSha256: 'b'.repeat(64) }, { signedSha256: hash('wrong bytes') },
    { unsignedSha256: hash('wrong input') },
  ])('rejects an invalid signing response: %j', async changes => {
    const test = await fixture();
    const signing = test.sign(test.paths[0]).catch((error: Error) => error);
    await test.reply(0, changes);
    expect((await signing).message).toContain('Invalid or stale');
    expect(await readFile(test.paths[0], 'utf8')).toBe('unsigned');
  });
  it('rejects input changed during signing', async () => {
    const test = await fixture();
    const signing = test.sign(test.paths[0]).catch((error: Error) => error);
    await test.reply(0, {}, true);
    expect((await signing).message).toContain('changed while waiting');
    expect(await readFile(test.paths[0], 'utf8')).toBe('new unsigned input');
  });
  it('rejects unknown files, out-of-order requests and dual signing', async () => {
    const test = await fixture();
    await expect(test.sign(join(test.root, 'arbitrary.exe'))).rejects.toThrow('Unexpected');
    await expect(test.sign(test.paths[3])).rejects.toThrow('Unexpected');
    await expect(test.sign(test.paths[0], { hash: 'sha1' })).rejects.toThrow('Unexpected');
    await expect(test.sign(test.paths[0], { isNest: true })).rejects.toThrow('Unexpected');
  });
  it('refuses a helper that differs from the verified toolset', async () => {
    const test = await fixture();
    const first = test.sign(test.paths[0]);
    await test.reply(0);
    await first;
    await expect(test.sign(test.paths[1], { helperSource: test.paths[0] })).rejects.toThrow('does not match');
  });
  it('times out without replacing the unsigned file', async () => {
    const test = await fixture(20);
    await expect(test.sign(test.paths[0])).rejects.toThrow('Timed out');
    expect(await readFile(test.paths[0], 'utf8')).toBe('unsigned');
  });
  it('rejects a request from a different run or build path', async () => {
    const test = await fixture();
    const request = { nonce: test.session.nonce, role: 'app', source: test.paths[0], id: 'request', unsignedSha256: hash('unsigned') };
    expect(() => validateRequest(test.session, request, 'app')).not.toThrow();
    expect(() => validateRequest(test.session, { ...request, nonce: 'old' }, 'app')).toThrow('stale');
    expect(() => validateRequest(test.session, { ...request, source: test.paths[1] }, 'app')).toThrow('stale');
  });
  it('stops waiting when the builder reports failure', async () => {
    const test = await fixture();
    await writeFile(join(test.root, 'build-result.json'), JSON.stringify({ success: false, error: 'NSIS failed' }));
    await expect(waitRequest(test.session, 'app')).rejects.toThrow('NSIS failed');
  });
});
