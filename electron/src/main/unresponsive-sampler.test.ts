import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logging', () => ({
  writeLog: vi.fn(),
}));

import { writeLog } from './logging';
import { createUnresponsiveSampler } from './unresponsive-sampler';

function createWindowMock(stack = 'stack sample') {
  const window = new EventEmitter() as EventEmitter & {
    isDestroyed: () => boolean;
    webContents: {
      isDestroyed: () => boolean;
      isDevToolsOpened: () => boolean;
      getURL: () => string;
      mainFrame: {
        collectJavaScriptCallStack: () => Promise<string>;
      };
    };
  };

  window.isDestroyed = () => false;
  window.webContents = {
    isDestroyed: () => false,
    isDevToolsOpened: () => false,
    getURL: () => 'hackdesk://renderer/index.html#/electron',
    mainFrame: {
      collectJavaScriptCallStack: vi.fn(async () => stack),
    },
  };

  return window;
}

describe('unresponsive sampler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('collects and flushes renderer stack samples', async () => {
    const window = createWindowMock();
    const sampler = createUnresponsiveSampler(window as never, 'main');

    sampler.start();
    await vi.advanceTimersByTimeAsync(1000);
    sampler.stopAndFlush();

    expect(window.webContents.mainFrame.collectJavaScriptCallStack).toHaveBeenCalled();
    expect(writeLog).toHaveBeenCalledWith('renderer', 'renderer unresponsive stack samples', expect.objectContaining({
      window: 'main',
      totalSamples: 1,
      samples: [{ count: 1, stack: 'stack sample' }],
    }), 'error');
  });
});
