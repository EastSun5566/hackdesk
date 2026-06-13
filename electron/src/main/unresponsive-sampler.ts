import type { BrowserWindow } from 'electron';

import { writeLog } from './logging';

const SAMPLE_INTERVAL_MS = 1000;
const MAX_SAMPLE_WINDOW_MS = 15000;

export function createUnresponsiveSampler(window: BrowserWindow, label: string) {
  let sampleTimer: ReturnType<typeof setTimeout> | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;
  let sampling = false;
  const samples = new Map<string, number>();

  const isActive = () => sampling && !window.isDestroyed() && !window.webContents.isDestroyed();

  const clearTimers = () => {
    if (sampleTimer) {
      clearTimeout(sampleTimer);
      sampleTimer = null;
    }

    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
  };

  const scheduleNextSample = () => {
    sampleTimer = setTimeout(() => {
      void collectSample();
    }, SAMPLE_INTERVAL_MS);
  };

  const collectSample = async () => {
    if (!isActive()) {
      return;
    }

    const stack = await window.webContents.mainFrame.collectJavaScriptCallStack().catch((error: unknown) => {
      writeLog('renderer', 'failed to collect unresponsive stack sample', {
        window: label,
        error: error instanceof Error ? error.message : String(error),
      }, 'warn');
      return undefined;
    });

    if (!isActive()) {
      return;
    }

    if (stack) {
      samples.set(stack, (samples.get(stack) ?? 0) + 1);
    }

    scheduleNextSample();
  };

  const stopAndFlush = () => {
    const wasSampling = sampling;
    sampling = false;
    clearTimers();

    if (samples.size === 0) {
      return wasSampling;
    }

    const orderedSamples = [...samples.entries()].sort((left, right) => right[1] - left[1]);
    const totalSamples = orderedSamples.reduce((total, [, count]) => total + count, 0);
    writeLog('renderer', 'renderer unresponsive stack samples', {
      window: label,
      url: window.isDestroyed() ? '<destroyed>' : window.webContents.getURL(),
      totalSamples,
      samples: orderedSamples.map(([stack, count]) => ({ count, stack })),
    }, 'error');
    samples.clear();
    return wasSampling;
  };

  const start = () => {
    if (sampling || window.isDestroyed() || window.webContents.isDestroyed() || window.webContents.isDevToolsOpened()) {
      return;
    }

    sampling = true;
    samples.clear();
    scheduleNextSample();
    stopTimer = setTimeout(stopAndFlush, MAX_SAMPLE_WINDOW_MS);
  };

  window.on('closed', stopAndFlush);

  return {
    start,
    stopAndFlush,
  };
}
