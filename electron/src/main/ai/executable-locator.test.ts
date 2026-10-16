import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildSearchPath, childEnvironment, parseLoginShellPath, resolveCommand } from './executable-locator';

async function fakeBin(name: string) {
  const directory = await mkdtemp(join(tmpdir(), 'hackdesk-locator-'));
  const bin = join(directory, 'bin');
  await mkdir(bin);
  const executable = join(bin, name);
  await writeFile(executable, '#!/bin/sh\n');
  await chmod(executable, 0o755);
  return { directory, bin, executable };
}

describe('executable locator', () => {
  it('reads the PATH between markers and ignores shell noise', () => {
    expect(parseLoginShellPath('motd\n__HACKDESK_LOGIN_PATH__\n/opt/bin:/usr/bin\n__HACKDESK_LOGIN_PATH__\n')).toBe('/opt/bin:/usr/bin');
    expect(parseLoginShellPath('no markers')).toBeNull();
  });

  it('searches the login PATH first, then the inherited PATH, then well-known folders', () => {
    const path = buildSearchPath('/login/bin:/usr/bin', { PATH: '/usr/bin:/inherited/bin' }, 'darwin', '/Users/me');
    expect(path.slice(0, 3)).toEqual(['/login/bin', '/usr/bin', '/inherited/bin']);
    expect(path).toContain('/opt/homebrew/bin');
    expect(path).toContain('/Users/me/.local/bin');
    expect(new Set(path).size).toBe(path.length);
  });

  it('finds a command a Finder-launched app would miss and prepares its PATH', async () => {
    const { bin, executable } = await fakeBin('codex');
    const resolved = await resolveCommand('codex', null, {
      env: { PATH: '/usr/bin:/bin', CLAUDECODE: '1' },
      platform: 'darwin',
      home: '/nonexistent',
      loginShellPath: async () => bin,
    });
    expect(resolved).toMatchObject({ ok: true, executable });
    if (!resolved.ok) return;
    expect(resolved.env.PATH?.split(':')[0]).toBe(bin);
    expect(resolved.env.CLAUDECODE).toBeUndefined();
  });

  it('reports a missing command and rejects a custom path that is not an executable', async () => {
    const options = { env: { PATH: '' }, platform: 'darwin' as const, home: '/nonexistent', loginShellPath: async () => null };
    expect(await resolveCommand('definitely-not-installed', null, options)).toMatchObject({ ok: false, reason: 'missing' });
    expect(await resolveCommand('codex', 'relative/codex', options)).toMatchObject({ ok: false, reason: 'invalid-path' });
    const { executable } = await fakeBin('my-codex');
    expect(await resolveCommand('codex', executable, options)).toMatchObject({ ok: true, executable });
  });

  it('keeps Windows PATH under its own key', () => {
    const env = childEnvironment('C:\\tools\\codex.exe', ['C:\\Windows'], { Path: 'C:\\Windows', ELECTRON_RUN_AS_NODE: '1' }, 'win32');
    expect(env.Path).toBe('C:\\tools;C:\\Windows');
    expect(env.PATH).toBeUndefined();
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });
});
