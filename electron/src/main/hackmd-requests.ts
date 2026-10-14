import { randomUUID } from 'node:crypto';
import type { WebContents, WebContentsDidStartNavigationEventParams, Event } from 'electron';

/** Request IDs are scoped to the sending window; no renderer can cancel another window's work. */
export function createHackmdRequests() {
  const owners = new Map<WebContents, { pending: Map<string, AbortController>; cleanup: () => void }>();

  function watch(owner: WebContents) {
    const existing = owners.get(owner);
    if (existing) return existing;
    const pending = new Map<string, AbortController>();
    const abort = () => {
      for (const controller of pending.values()) controller.abort();
      pending.clear();
    };
    const navigation = (details: Event<WebContentsDidStartNavigationEventParams>) => {
      if (details.isMainFrame && !details.isSameDocument) abort();
    };
    const cleanup = () => {
      abort();
      owner.removeListener('destroyed', cleanup);
      owner.removeListener('render-process-gone', abort);
      owner.removeListener('did-start-navigation', navigation);
      owners.delete(owner);
    };
    owner.on('destroyed', cleanup);
    owner.on('render-process-gone', abort);
    owner.on('did-start-navigation', navigation);
    const entry = { pending, cleanup };
    owners.set(owner, entry);
    return entry;
  }

  return {
    async run<T>(owner: WebContents, requestId: string | undefined, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
      if (owner.isDestroyed()) throw new Error('The requesting window has closed.');
      const entry = watch(owner);
      const id = requestId ?? randomUUID();
      if (entry.pending.has(id) || entry.pending.size >= 64) throw new Error('Too many or duplicate HackMD requests.');
      const controller = new AbortController();
      entry.pending.set(id, controller);
      try {
        return await task(controller.signal);
      } finally {
        if (entry.pending.get(id) === controller) entry.pending.delete(id);
      }
    },
    cancel(owner: WebContents, requestId: string) {
      owners.get(owner)?.pending.get(requestId)?.abort();
    },
    dispose() {
      for (const entry of owners.values()) entry.cleanup();
    },
  };
}
