import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { release, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { DictationEvent, DictationStatus } from '../../../../src/lib/dictation';
import {
  createLineSplitter,
  createStderrTail,
  onCliGone,
  parseJsonObject,
  runCli,
  spawnCli,
  terminate,
} from '../ai/cli-process';

/** A whole five-minute transcript fits easily; anything longer is not the helper talking. */
const MAX_LINE_CHARACTERS = 1024 * 1024;
const STATUS_TIMEOUT_MS = 15_000;
/** How long a cancelled helper may take to wind down before it is killed. */
const CANCEL_GRACE_MS = 2_000;

export type DictationHelper = {
  /** The helper executable, or null when this build has none. */
  path: string | null;
  /** Why this system cannot run it (for example, macOS older than 26), or null when it can. */
  unsupportedReason: string | null;
};

/**
 * Finds the helper: in the app's resources when packaged, in build/native during development.
 * Development and tests may point HACKDESK_SPEECH_HELPER at a stand-in.
 */
export function locateSpeechHelper(app: { isPackaged: boolean; getAppPath: () => string }): DictationHelper {
  const override = app.isPackaged ? undefined : process.env.HACKDESK_SPEECH_HELPER;
  if (override) return { path: override, unsupportedReason: null };
  // Darwin 25 is macOS 26, the first with SpeechAnalyzer.
  if (process.platform !== 'darwin' || Number.parseInt(release(), 10) < 25) {
    return { path: null, unsupportedReason: 'Dictation needs macOS 26 or later.' };
  }
  const path = app.isPackaged
    ? join(process.resourcesPath, 'native', 'hackdesk-speech')
    : join(app.getAppPath(), 'build', 'native', 'hackdesk-speech');
  return { path: existsSync(path) ? path : null, unsupportedReason: null };
}

type HelperLine = Record<string, unknown> & { type?: unknown };

function unavailable(message: string): DictationStatus {
  return { available: false, message, locales: [], installed: [], suggested: null };
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toEvent(line: HelperLine): DictationEvent | null {
  switch (line.type) {
    case 'ready':
      return { type: 'ready' };
    case 'level':
      return typeof line.value === 'number' ? { type: 'level', value: Math.max(0, Math.min(1, line.value)) } : null;
    case 'volatile':
    case 'final':
      return typeof line.text === 'string' ? { type: line.type, text: line.text } : null;
    case 'progress':
      return typeof line.fraction === 'number' ? { type: 'progress', fraction: Math.max(0, Math.min(1, line.fraction)) } : null;
    default:
      return null;
  }
}

/**
 * Runs one helper command, passing its events on, until it reports an outcome: the value `settle`
 * returns for a line. Aborting sends `cancel` and resolves with `onCancel()`.
 */
function runHelper<T>(path: string, args: string[], options: {
  signal: AbortSignal;
  onEvent: (event: DictationEvent) => void;
  settle: (line: HelperLine) => { value: T } | null;
  onCancel: () => T;
  onSpawn?: (child: ChildProcessWithoutNullStreams) => void;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnCli(path, args, { cwd: tmpdir(), env: process.env });
    } catch (error) {
      reject(error);
      return;
    }
    const stderr = createStderrTail();
    let settled = false;
    let cancelled = false;
    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      options.signal.removeEventListener('abort', cancel);
      outcome();
    };
    const fail = (error: Error) => finish(() => {
      terminate(child);
      reject(error);
    });
    const cancel = () => {
      if (settled || cancelled) return;
      cancelled = true;
      child.stdin.write('{"type":"cancel"}\n');
      setTimeout(() => terminate(child), CANCEL_GRACE_MS).unref();
      finish(() => resolve(options.onCancel()));
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', createLineSplitter(MAX_LINE_CHARACTERS, (text) => {
      const line = parseJsonObject(text) as HelperLine | null;
      if (!line || settled) return;
      if (line.type === 'error') {
        fail(new Error(typeof line.message === 'string' ? line.message : 'Dictation failed.'));
        return;
      }
      const outcome = options.settle(line);
      if (outcome) {
        finish(() => resolve(outcome.value));
        return;
      }
      const event = toEvent(line);
      if (event) options.onEvent(event);
    }, () => fail(new Error('The dictation helper sent an oversized message.'))));
    child.stderr.on('data', (chunk: string) => stderr.push(chunk));
    // A helper that exits before reading must not crash HackDesk with EPIPE.
    child.stdin.on('error', () => undefined);
    child.on('error', error => fail(error));
    onCliGone(child, (code) => {
      fail(new Error(stderr.text || `The dictation helper stopped unexpectedly (exit code ${code ?? 'unknown'}).`));
    });
    options.signal.addEventListener('abort', cancel, { once: true });
    if (options.signal.aborted) cancel();
    else options.onSpawn?.(child);
  });
}

/**
 * Speech recognition through the native helper. One recording runs at a time across all windows;
 * starting another cancels the first.
 */
export function createDictationService(locate: () => DictationHelper) {
  let located: DictationHelper | null = null;
  // Found on first use, so starting HackDesk never waits on it.
  const helperInfo = () => (located ??= locate());
  let active: { requestId: string; child: ChildProcessWithoutNullStreams | null; cancel: () => void } | null = null;

  function requireHelper() {
    const helper = helperInfo();
    if (helper.unsupportedReason) throw new Error(helper.unsupportedReason);
    if (!helper.path) throw new Error('This build of HackDesk does not include dictation.');
    return helper.path;
  }

  return {
    async status(): Promise<DictationStatus> {
      const helper = helperInfo();
      if (helper.unsupportedReason) return unavailable(helper.unsupportedReason);
      if (!helper.path) return unavailable('This build of HackDesk does not include dictation.');
      const result = await runCli(helper.path, ['status'], { cwd: tmpdir(), env: process.env, timeoutMs: STATUS_TIMEOUT_MS });
      const line = result.stdout.split('\n').map(text => parseJsonObject(text.trim())).find(value => value?.type === 'status');
      if (!line) return unavailable(result.stderr || 'Dictation could not start on this Mac.');
      if (line.available === false) return { ...unavailable('Speech recognition is not available on this Mac right now.'), locales: strings(line.locales) };
      return {
        available: true,
        message: null,
        locales: strings(line.locales),
        installed: strings(line.installed),
        suggested: typeof line.suggested === 'string' ? line.suggested : null,
      };
    },

    /** Downloads a language's speech model through macOS; it is shared with other apps. */
    install(locale: string, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<boolean> {
      return runHelper(requireHelper(), ['install', '--locale', locale], {
        signal,
        onEvent: (event) => { if (event.type === 'progress') onProgress(event.fraction); },
        settle: line => line.type === 'installed' ? { value: true } : null,
        onCancel: () => false,
      });
    },

    /**
     * Records until `stop` and resolves with the transcript, or with null when cancelled
     * (by `signal`, or by another recording starting).
     */
    start(requestId: string, locale: string | null, signal: AbortSignal, onEvent: (event: DictationEvent) => void): Promise<string | null> {
      const path = requireHelper();
      active?.cancel();
      const controller = new AbortController();
      const forward = () => controller.abort();
      signal.addEventListener('abort', forward, { once: true });
      if (signal.aborted) controller.abort();
      const session: NonNullable<typeof active> = { requestId, child: null, cancel: () => controller.abort() };
      active = session;
      return runHelper(path, ['transcribe', ...(locale ? ['--locale', locale] : [])], {
        signal: controller.signal,
        onEvent,
        settle: line => line.type === 'done' ? { value: typeof line.text === 'string' ? line.text : '' }
          : line.type === 'cancelled' ? { value: null } : null,
        onCancel: () => null,
        onSpawn: (child) => { session.child = child; },
      }).finally(() => {
        signal.removeEventListener('abort', forward);
        if (active === session) active = null;
      });
    },

    /** Ends the recording; the helper finishes recognizing what it heard and `start` resolves. */
    stop(requestId: string) {
      if (active?.requestId !== requestId) return;
      active.child?.stdin.write('{"type":"stop"}\n');
    },

    dispose() {
      active?.cancel();
    },
  };
}

