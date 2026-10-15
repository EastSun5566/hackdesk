import { execFile } from 'node:child_process';
import { access, constants, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter as posixDelimiter, dirname, isAbsolute, join, win32 } from 'node:path';

const PATH_MARKER = '__HACKDESK_LOGIN_PATH__';
const LOGIN_SHELL_TIMEOUT_MS = 5_000;
/** Variables that make a CLI believe it runs nested inside another agent or as Electron's Node. */
const STRIPPED_CHILD_VARIABLES = ['ELECTRON_RUN_AS_NODE', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'];

export type LocatorOptions = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  home?: string;
  /** Injected by tests; production asks the user's login shell once per app run. */
  loginShellPath?: () => Promise<string | null>;
};

export type ResolvedCommand =
  | { ok: true; executable: string; env: NodeJS.ProcessEnv }
  | { ok: false; reason: 'missing' | 'invalid-path'; message: string };

let cachedLoginShellPath: Promise<string | null> | null = null;

function pathKey(env: NodeJS.ProcessEnv) {
  return Object.keys(env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
}

function pathDelimiter(platform: NodeJS.Platform) {
  return platform === 'win32' ? win32.delimiter : posixDelimiter;
}

/**
 * Finder and the Dock start apps with a bare PATH, so Homebrew and npm CLIs are invisible.
 * The login shell knows the PATH the user sees in Terminal; `printenv` reads it in any shell.
 */
export function readLoginShellPath(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform) {
  if (platform === 'win32') return Promise.resolve(null);
  cachedLoginShellPath ??= new Promise<string | null>((resolve) => {
    const fallbackShell = platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
    const shell = env.SHELL && isAbsolute(env.SHELL) ? env.SHELL : fallbackShell;
    execFile(
      shell,
      ['-ilc', `echo ${PATH_MARKER}; printenv PATH; echo ${PATH_MARKER}`],
      { env, timeout: LOGIN_SHELL_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      // A noisy or failing rc file still prints the markers, so the output is read either way.
      (_error, stdout) => resolve(parseLoginShellPath(String(stdout ?? ''))),
    );
  });
  return cachedLoginShellPath;
}

export function parseLoginShellPath(output: string) {
  const parts = output.split(PATH_MARKER);
  if (parts.length < 3) return null;
  const path = parts[1]?.trim() ?? '';
  return path || null;
}

function wellKnownDirectories(platform: NodeJS.Platform, home: string, env: NodeJS.ProcessEnv) {
  if (platform === 'win32') {
    return [
      win32.join(home, '.local', 'bin'),
      ...(env.APPDATA ? [win32.join(env.APPDATA, 'npm')] : []),
    ];
  }
  return [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(home, '.local', 'bin'),
    join(home, '.claude', 'local'),
    join(home, '.npm-global', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, '.volta', 'bin'),
    join(home, '.cargo', 'bin'),
    '/usr/bin',
    '/bin',
  ];
}

export function buildSearchPath(
  loginPath: string | null,
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  home: string,
) {
  const separator = pathDelimiter(platform);
  const entries = [
    ...(loginPath ?? '').split(separator),
    ...(env[pathKey(env)] ?? '').split(separator),
    ...wellKnownDirectories(platform, home, env),
  ].map(entry => entry.trim()).filter(Boolean);
  return [...new Set(entries)];
}

async function isExecutableFile(path: string, platform: NodeJS.Platform) {
  try {
    if (!(await stat(path)).isFile()) return false;
    if (platform !== 'win32') await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Windows npm installs are `.cmd` shims Node cannot spawn without a shell, so only real binaries count. */
function candidateNames(command: string, platform: NodeJS.Platform) {
  return platform === 'win32' ? [`${command}.exe`] : [command];
}

export function childEnvironment(
  executable: string,
  searchPath: string[],
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env };
  for (const key of STRIPPED_CHILD_VARIABLES) delete next[key];
  const key = pathKey(next);
  // An npm CLI is `#!/usr/bin/env node`, so the directories that hold `node` must come along.
  const directory = platform === 'win32' ? win32.dirname(executable) : dirname(executable);
  next[key] = [...new Set([directory, ...searchPath])].join(pathDelimiter(platform));
  return next;
}

export async function resolveCommand(
  command: string,
  customPath: string | null | undefined,
  options: LocatorOptions = {},
): Promise<ResolvedCommand> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const loginPath = await (options.loginShellPath ?? (() => readLoginShellPath(env, platform)))();
  const searchPath = buildSearchPath(loginPath, env, platform, home);
  const custom = customPath?.trim();

  if (custom) {
    const absolute = platform === 'win32' ? win32.isAbsolute(custom) : isAbsolute(custom);
    if (!absolute || !(await isExecutableFile(custom, platform))) {
      return { ok: false, reason: 'invalid-path', message: `No executable was found at ${custom}.` };
    }
    return { ok: true, executable: custom, env: childEnvironment(custom, searchPath, env, platform) };
  }

  for (const directory of searchPath) {
    for (const name of candidateNames(command, platform)) {
      const candidate = platform === 'win32' ? win32.join(directory, name) : join(directory, name);
      if (await isExecutableFile(candidate, platform)) {
        return { ok: true, executable: candidate, env: childEnvironment(candidate, searchPath, env, platform) };
      }
    }
  }
  return { ok: false, reason: 'missing', message: `The ${command} command was not found on this computer.` };
}
