import { EventEmitter } from 'node:events';
import type { WebContents } from 'electron';
import { describe, expect, it } from 'vitest';
import { createHackmdRequests } from './hackmd-requests';

const owner = () => Object.assign(new EventEmitter(), { isDestroyed: () => false }) as unknown as WebContents;
const hold = (signal: AbortSignal) => new Promise<never>((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

describe('HackMD request ownership', () => {
  it('names the kind of work in its errors', async () => {
    const requests = createHackmdRequests('AI');
    const sender = owner();
    const pending = requests.run(sender, 'a', hold);
    await expect(requests.run(sender, 'a', async () => 'duplicate')).rejects.toThrow('Too many or duplicate AI requests.');
    requests.cancel(sender, 'a');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    requests.dispose();
  });

  it('scopes cancellation to the owning window and rejects duplicate active IDs', async () => {
    const requests = createHackmdRequests();
    const a = owner();
    const b = owner();
    let signal!: AbortSignal;
    const pending = expect(requests.run(a, 'a', input => { signal = input; return hold(input); })).rejects.toMatchObject({ name: 'AbortError' });
    requests.cancel(b, 'a');
    expect(signal.aborted).toBe(false);
    await expect(requests.run(a, 'a', async () => 'duplicate')).rejects.toThrow('duplicate');
    requests.cancel(a, 'a');
    await pending;
    expect(await requests.run(a, 'a', async () => 'reused')).toBe('reused');
    requests.dispose();
  });

  it('keeps same-document/subframe navigation but cancels a main-frame reload', async () => {
    const requests = createHackmdRequests();
    const sender = owner();
    let signal!: AbortSignal;
    const pending = expect(requests.run(sender, 'a', input => { signal = input; return hold(input); })).rejects.toMatchObject({ name: 'AbortError' });
    sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
    sender.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false });
    expect(signal.aborted).toBe(false);
    sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
    await pending;
    expect(await requests.run(sender, 'a', async () => 'new renderer')).toBe('new renderer');
    requests.dispose();
  });

  it('cancels crashed/closed windows and removes lifecycle listeners on disposal', async () => {
    const requests = createHackmdRequests();
    const a = owner();
    const b = owner();
    const first = expect(requests.run(a, 'a', hold)).rejects.toMatchObject({ name: 'AbortError' });
    a.emit('render-process-gone', {});
    await first;
    const restarted = expect(requests.run(a, 'a', hold)).rejects.toMatchObject({ name: 'AbortError' });
    a.emit('destroyed');
    await restarted;
    const second = expect(requests.run(b, 'a', hold)).rejects.toMatchObject({ name: 'AbortError' });
    requests.dispose();
    await second;
    for (const sender of [a, b]) {
      expect(sender.listenerCount('did-start-navigation')).toBe(0);
      expect(sender.listenerCount('render-process-gone')).toBe(0);
      expect(sender.listenerCount('destroyed')).toBe(0);
    }
  });
});
