import type { HackDeskElectronAPI, HackmdRequestOptions } from './electron-api';

/** AbortSignal stays in the renderer; only a request ID crosses the bridge. */
export async function runHackmdRequest<const A extends unknown[], T>(
  api: HackDeskElectronAPI['hackmd'],
  signal: AbortSignal | undefined,
  request: (...args: NoInfer<[...A, HackmdRequestOptions?]>) => Promise<T>,
  args: A,
): Promise<T> {
  signal?.throwIfAborted();
  const cancel = api.cancelRequest;
  if (!signal || !cancel) {
    const parameters: [...A, HackmdRequestOptions?] = [...args];
    return request(...parameters);
  }
  const requestId = crypto.randomUUID();
  const abort = () => { void cancel(requestId).catch(() => undefined); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const result = await request(...args, { requestId });
    signal.throwIfAborted();
    return result;
  } catch (error) {
    // IPC preserves only an error's message. Restore the caller's cancellation reason.
    signal.throwIfAborted();
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
