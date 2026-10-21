import { rm } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';

import type { DictationEvent } from '../../../../src/lib/dictation';
import { createDictationService } from './dictation-service';
import { createFakeSpeechHelper, type FakeSpeechMode } from './fake-speech-helper';

const directories: string[] = [];

async function service(mode: FakeSpeechMode = 'ok') {
  const fake = await createFakeSpeechHelper(mode);
  directories.push(fake.directory);
  return createDictationService(() => ({ path: fake.executable, unsupportedReason: null }));
}

/** Starts a recording and resolves once the helper has heard something. */
async function record(dictation: Awaited<ReturnType<typeof service>>, requestId: string, signal = new AbortController().signal) {
  const events: DictationEvent[] = [];
  let heard!: () => void;
  const ready = new Promise<void>((resolve) => { heard = resolve; });
  const result = dictation.start(requestId, 'en-US', signal, (event) => {
    events.push(event);
    if (event.type === 'volatile' && event.text === ' Second') heard();
  });
  await Promise.race([ready, result]);
  return { events, result };
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

describe.skipIf(process.platform === 'win32')('dictation service', () => {
  it('reports the languages the helper supports and has installed', async () => {
    const dictation = await service();
    await expect(dictation.status()).resolves.toEqual({
      available: true, message: null, locales: ['en-US', 'zh-TW'], installed: ['en-US'], suggested: 'en-US',
    });
  });

  it('explains instead of running when the system or build cannot dictate', async () => {
    const old = createDictationService(() => ({ path: null, unsupportedReason: 'Dictation needs macOS 26 or later.' }));
    await expect(old.status()).resolves.toMatchObject({ available: false, message: 'Dictation needs macOS 26 or later.' });
    expect(() => old.start('a', null, new AbortController().signal, () => undefined)).toThrow('macOS 26');
    const missing = createDictationService(() => ({ path: null, unsupportedReason: null }));
    await expect(missing.status()).resolves.toMatchObject({ available: false, message: expect.stringContaining('does not include dictation') });
  });

  it('streams install progress', async () => {
    const dictation = await service();
    const progress: number[] = [];
    await expect(dictation.install('zh-TW', new AbortController().signal, fraction => progress.push(fraction))).resolves.toBe(true);
    expect(progress).toEqual([0.5]);
  });

  it('records until stopped, then resolves with the whole transcript', async () => {
    const dictation = await service();
    const { events, result } = await record(dictation, 'r1');
    dictation.stop('someone-else');
    dictation.stop('r1');
    await expect(result).resolves.toBe('Hello world. Second line.');
    expect(events).toEqual([
      { type: 'ready' },
      { type: 'level', value: 0.4 },
      { type: 'volatile', text: 'Hello' },
      { type: 'final', text: 'Hello world.' },
      { type: 'volatile', text: ' Second' },
      { type: 'final', text: ' Second line.' },
    ]);
  });

  it('resolves null when cancelled, and a new recording cancels the one before it', async () => {
    const dictation = await service();
    const controller = new AbortController();
    const first = await record(dictation, 'r1', controller.signal);
    controller.abort();
    await expect(first.result).resolves.toBeNull();

    const second = await record(dictation, 'r2');
    const third = await record(dictation, 'r3');
    await expect(second.result).resolves.toBeNull();
    dictation.stop('r3');
    await expect(third.result).resolves.toBe('Hello world. Second line.');
  });

  it('rejects with the helper\'s explanation or its last words', async () => {
    const denied = await service('denied');
    await expect(denied.start('r1', null, new AbortController().signal, () => undefined)).rejects.toThrow('microphone access');
    const crashed = await service('crash');
    await expect(crashed.start('r2', null, new AbortController().signal, () => undefined)).rejects.toThrow('audio engine failed');
  });
});
