import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

const KILL_GRACE_MS = 2_000;
const STDERR_TAIL_CHARACTERS = 16_384;
// oxlint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001B\[[0-9;?]*[A-Za-z]/g;

export type CliRunOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** Written whole, then stdin closes: for CLIs that answer one request and exit. */
  input?: string;
  timeoutMs?: number;
  maxOutputCharacters?: number;
  signal?: AbortSignal;
};

export type CliRunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export function spawnCli(executable: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) {
  return spawn(executable, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

/** SIGTERM first; a CLI that ignores it is killed once the grace period ends. */
export function terminate(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const timer = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, KILL_GRACE_MS);
  timer.unref();
  child.once('exit', () => clearTimeout(timer));
}

export function cleanCliMessage(text: string) {
  return text.replace(ANSI_PATTERN, '').trim();
}

/** Keeps only the end of stderr, which is where a CLI explains why it stopped. */
export function createStderrTail() {
  let tail = '';
  return {
    push(chunk: string) {
      tail = (tail + chunk).slice(-STDERR_TAIL_CHARACTERS);
    },
    get text() {
      return cleanCliMessage(tail);
    },
  };
}

/** Splits NDJSON output into lines; one oversized line ends the stream instead of growing memory. */
export function createLineSplitter(maxLineCharacters: number, onLine: (line: string) => void, onOverflow: () => void) {
  let buffer = '';
  let overflowed = false;
  return (chunk: string) => {
    if (overflowed) return;
    buffer += chunk;
    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line.length > maxLineCharacters) {
        overflowed = true;
        onOverflow();
        return;
      }
      if (line) onLine(line);
      newline = buffer.indexOf('\n');
    }
    if (buffer.length > maxLineCharacters) {
      overflowed = true;
      onOverflow();
    }
  };
}

/** A short-lived CLI run bounded by a watchdog, an output cap and cancellation. */
export function runCli(executable: string, args: string[], options: CliRunOptions): Promise<CliRunResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxOutput = options.maxOutputCharacters ?? 2 * 1024 * 1024;
  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnCli(executable, args, options);
    } catch (error) {
      resolve({ code: -1, stdout: '', stderr: error instanceof Error ? error.message : String(error), timedOut: false });
      return;
    }
    let stdout = '';
    const stderr = createStderrTail();
    let timedOut = false;
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      options.signal?.removeEventListener('abort', abort);
      resolve({ code, stdout, stderr: stderr.text, timedOut });
    };
    const abort = () => terminate(child);
    const watchdog = setTimeout(() => {
      timedOut = true;
      terminate(child);
    }, timeoutMs);
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > maxOutput) {
        stdout = stdout.slice(0, maxOutput);
        terminate(child);
      }
    });
    child.stderr.on('data', (chunk: string) => stderr.push(chunk));
    // A CLI that exits before reading must not crash HackDesk with EPIPE.
    child.stdin.on('error', () => undefined);
    child.on('error', (error) => {
      stderr.push(error.message);
      finish(-1);
    });
    child.on('close', code => finish(code));
    child.stdin.end(options.input ?? '');
  });
}

export function parseVersion(output: string) {
  return /\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?/.exec(output)?.[0] ?? null;
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
