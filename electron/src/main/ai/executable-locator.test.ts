import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildSearchPath, childEnvironment, parseCmdShimTarget, parseLoginShellPath, resolveCommand } from './executable-locator';

// What npm's cmd-shim writes for a Node script and for a native binary.
const SCRIPT_SHIM = [
  '@ECHO off', 'GOTO start', ':find_dp0', 'SET dp0=%~dp0', 'EXIT /b', ':start', 'SETLOCAL', 'CALL :find_dp0',
  'IF EXIST "%dp0%\\node.exe" (', '  SET "_prog=%dp0%\\node.exe"', ') ELSE (', '  SET "_prog=node"', ')',
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*',
].join('\r\n');
const BINARY_SHIM = '@ECHO off\r\nGOTO start\r\n:start\r\n"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*\r\n';

/** A Windows file system in memory: the paths these tests need cannot exist on macOS or Linux. */
function windowsFiles(files: Record<string, string>) {
  return {
    isExecutable: async (path: string) => path in files,
    readText: async (path: string) => {
      if (!(path in files)) throw new Error('missing');
      return files[path]!;
    },
  };
}

const windows = (files: Record<string, string>, path = 'C:\\npm') => ({
  env: { Path: path },
  platform: 'win32' as const,
  home: 'C:\\Users\\me',
  loginShellPath: async () => null,
  files: windowsFiles(files),
});

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

  it('reads the target an npm cmd-shim launches', () => {
    expect(parseCmdShimTarget(SCRIPT_SHIM)).toBe('node_modules\\@openai\\codex\\bin\\codex.js');
    expect(parseCmdShimTarget(BINARY_SHIM)).toBe('node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe');
    expect(parseCmdShimTarget('"%~dp0\\node_modules\\x\\cli.js" %*')).toBe('node_modules\\x\\cli.js');
    expect(parseCmdShimTarget('echo hello')).toBeNull();
  });

  it('runs a Windows npm install without a shell: its .exe directly, or its script under Node', async () => {
    const claudeExe = 'C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe';
    expect(await resolveCommand('claude', null, windows({ 'C:\\npm\\claude.cmd': BINARY_SHIM, [claudeExe]: '' })))
      .toMatchObject({ ok: true, executable: claudeExe, prefixArgs: [] });

    const script = 'C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js';
    const shim = { 'C:\\npm\\codex.cmd': SCRIPT_SHIM, [script]: '' };
    expect(await resolveCommand('codex', null, windows({ ...shim, 'C:\\npm\\node.exe': '' })))
      .toMatchObject({ ok: true, executable: 'C:\\npm\\node.exe', prefixArgs: [script] });
    expect(await resolveCommand('codex', null, windows({ ...shim, 'C:\\node\\node.exe': '' }, 'C:\\npm;C:\\node')))
      .toMatchObject({ ok: true, executable: 'C:\\node\\node.exe', prefixArgs: [script] });
    expect(await resolveCommand('codex', null, windows(shim))).toMatchObject({ ok: false, reason: 'unsupported-shim', message: expect.stringContaining('Node.js') });
    expect(await resolveCommand('codex', null, windows({ 'C:\\npm\\codex.cmd': 'echo hi' }))).toMatchObject({ ok: false, reason: 'unsupported-shim' });
  });

  it('prefers a real .exe over a shim, and reads a shim given as the command path', async () => {
    expect(await resolveCommand('claude', null, windows({ 'C:\\npm\\claude.exe': '', 'C:\\npm\\claude.cmd': BINARY_SHIM })))
      .toMatchObject({ ok: true, executable: 'C:\\npm\\claude.exe' });
    const claudeExe = 'C:\\tools\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe';
    expect(await resolveCommand('claude', 'C:\\tools\\claude.cmd', windows({ 'C:\\tools\\claude.cmd': BINARY_SHIM, [claudeExe]: '' })))
      .toMatchObject({ ok: true, executable: claudeExe });
  });

  it('keeps Windows PATH under its own key', () => {
    const env = childEnvironment('C:\\tools\\codex.exe', ['C:\\Windows'], { Path: 'C:\\Windows', ELECTRON_RUN_AS_NODE: '1' }, 'win32');
    expect(env.Path).toBe('C:\\tools;C:\\Windows');
    expect(env.PATH).toBeUndefined();
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });
});
