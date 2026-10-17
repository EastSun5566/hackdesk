import { execFile } from 'node:child_process';
import { access, constants, readFile, stat } from 'node:fs/promises';
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
  /** Injected by tests, which cannot create Windows paths on another OS; production uses the disk. */
  files?: LocatorFiles;
};

type LocatorFiles = {
  isExecutable: (path: string, platform: NodeJS.Platform) => Promise<boolean>;
  readText: (path: string) => Promise<string>;
};

export type ResolvedCommand =
  /** `prefixArgs` come before the CLI's own arguments: the script when an npm shim runs it with Node. */
  | { ok: true; executable: string; prefixArgs: string[]; env: NodeJS.ProcessEnv }
  | { ok: false; reason: 'missing' | 'invalid-path' | 'unsupported-shim'; message: string };

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

const diskFiles: LocatorFiles = {
  isExecutable: isExecutableFile,
  readText: path => readFile(path, 'utf8'),
};

/** Windows npm installs are `.cmd` shims; Node cannot spawn those, so they are read instead. */
function candidateNames(command: string, platform: NodeJS.Platform) {
  return platform === 'win32' ? [`${command}.exe`, `${command}.cmd`] : [command];
}

/**
 * npm's cmd-shim ends by running its target as `"%dp0%\…"` (older shims write `%~dp0\…`), after
 * any `%dp0%\node.exe` check; the last such path that is not `node.exe` is what it launches.
 */
export function parseCmdShimTarget(content: string) {
  const targets = [...content.matchAll(/"%~?dp0%?\\([^"%]+)"/gi)]
    .map(match => match[1]!)
    .filter(target => !/^node\.exe$/i.test(target));
  return targets.at(-1) ?? null;
}

/** Runs what an npm `.cmd` shim runs, without a shell: its `.exe` directly, or its script under Node. */
async function resolveCmdShim(shim: string, searchPath: string[], files: LocatorFiles): Promise<
  { executable: string; prefixArgs: string[] } | { error: string }
> {
  const unsupported = { error: `HackDesk could not tell what ${shim} runs. Set the command path to the program it starts in Settings › AI.` };
  let content: string;
  try {
    content = await files.readText(shim);
  } catch {
    return unsupported;
  }
  const relative = parseCmdShimTarget(content);
  if (!relative) return unsupported;
  const target = win32.join(win32.dirname(shim), relative);
  if (/\.exe$/i.test(target)) {
    return (await files.isExecutable(target, 'win32')) ? { executable: target, prefixArgs: [] } : unsupported;
  }
  if (!/\.[cm]?js$/i.test(target) || !(await files.isExecutable(target, 'win32'))) return unsupported;
  // The shim prefers a node.exe beside itself, then whichever one PATH finds.
  for (const directory of [win32.dirname(shim), ...searchPath]) {
    const node = win32.join(directory, 'node.exe');
    if (await files.isExecutable(node, 'win32')) return { executable: node, prefixArgs: [target] };
  }
  return { error: `${shim} needs Node.js, which was not found. Install Node.js or set the command path in Settings › AI.` };
}

async function launchFor(
  path: string,
  searchPath: string[],
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  files: LocatorFiles,
): Promise<ResolvedCommand> {
  if (platform === 'win32' && /\.cmd$/i.test(path)) {
    const shim = await resolveCmdShim(path, searchPath, files);
    if ('error' in shim) return { ok: false, reason: 'unsupported-shim', message: shim.error };
    return { ok: true, ...shim, env: childEnvironment(shim.executable, searchPath, env, platform) };
  }
  return { ok: true, executable: path, prefixArgs: [], env: childEnvironment(path, searchPath, env, platform) };
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
  const files = options.files ?? diskFiles;

  if (custom) {
    const absolute = platform === 'win32' ? win32.isAbsolute(custom) : isAbsolute(custom);
    if (!absolute || !(await files.isExecutable(custom, platform))) {
      return { ok: false, reason: 'invalid-path', message: `No executable was found at ${custom}.` };
    }
    return launchFor(custom, searchPath, env, platform, files);
  }

  for (const directory of searchPath) {
    for (const name of candidateNames(command, platform)) {
      const candidate = platform === 'win32' ? win32.join(directory, name) : join(directory, name);
      if (await files.isExecutable(candidate, platform)) return launchFor(candidate, searchPath, env, platform, files);
    }
  }
  return { ok: false, reason: 'missing', message: `The ${command} command was not found on this computer.` };
}
