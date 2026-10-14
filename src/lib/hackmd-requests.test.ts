import { describe, expect, it, vi } from 'vitest';
import type { HackDeskElectronAPI, HackmdRequestOptions } from './electron-api';
import { runHackmdRequest } from './hackmd-requests';

describe('renderer request cancellation', () => {
  it('sends only a request ID across the bridge and restores IPC cancellation errors', async () => {
    const controller = new AbortController();
    let reject!: (error: Error) => void;
    let metadata!: HackmdRequestOptions;
    const read = vi.fn((_id: string, options?: HackmdRequestOptions) => {
      metadata = options!;
      return new Promise<string>((_resolve, fail) => { reject = fail; });
    });
    const cancelRequest = vi.fn(async () => { reject(new Error('IPC serialized cancellation')); });
    const api = { cancelRequest } as unknown as HackDeskElectronAPI['hackmd'];
    const pending = expect(runHackmdRequest(api, controller.signal, read, ['note'])).rejects.toMatchObject({ name: 'AbortError' });
    expect(Object.keys(metadata)).toEqual(['requestId']);
    expect(metadata.requestId).toMatch(/^[a-f\d-]{36}$/);
    controller.abort();
    await pending;
    expect(cancelRequest).toHaveBeenCalledExactlyOnceWith(metadata.requestId);
  });

  it('does not invoke an already cancelled request or leave a settled abort listener', async () => {
    const controller = new AbortController();
    const cancelRequest = vi.fn(async () => undefined);
    const api = { cancelRequest } as unknown as HackDeskElectronAPI['hackmd'];
    const read = vi.fn(async (_options?: HackmdRequestOptions) => 'done');
    expect(await runHackmdRequest(api, controller.signal, read, [])).toBe('done');
    controller.abort();
    expect(cancelRequest).not.toHaveBeenCalled();
    await expect(runHackmdRequest(api, controller.signal, read, [])).rejects.toMatchObject({ name: 'AbortError' });
    expect(read).toHaveBeenCalledOnce();
  });
});
