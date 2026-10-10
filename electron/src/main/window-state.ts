import { app, screen, type BrowserWindow, type Rectangle } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { writeLog } from './logging';

type PersistedWindowState = {
  bounds?: Rectangle;
  isMaximized?: boolean;
};

type DisplayBounds = Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>;

const WINDOW_STATE_FILE = 'window-state.json';
const MIN_VISIBLE_EDGE = 80;

function getWindowStatePath() {
  return join(app.getPath('userData'), WINDOW_STATE_FILE);
}

function intersects(a: DisplayBounds, b: DisplayBounds) {
  return (
    a.x < b.x + b.width - MIN_VISIBLE_EDGE
    && a.x + a.width > b.x + MIN_VISIBLE_EDGE
    && a.y < b.y + b.height - MIN_VISIBLE_EDGE
    && a.y + a.height > b.y + MIN_VISIBLE_EDGE
  );
}

export function normalizeWindowState(
  state: PersistedWindowState | null,
  fallbackBounds: Rectangle,
  displayBounds: DisplayBounds[],
): PersistedWindowState {
  const bounds = state?.bounds;
  const hasVisibleBounds = Boolean(
    bounds
    && bounds.width >= 900
    && bounds.height >= 620
    && displayBounds.some((display) => intersects(bounds, display)),
  );

  return {
    bounds: hasVisibleBounds ? bounds : fallbackBounds,
    isMaximized: Boolean(state?.isMaximized),
  };
}

export function readWindowState(fallbackBounds: Rectangle): PersistedWindowState {
  let state: PersistedWindowState | null = null;
  const statePath = getWindowStatePath();

  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readFileSync(statePath, 'utf8')) as PersistedWindowState;
    } catch {
      state = null;
    }
  }

  return normalizeWindowState(
    state,
    fallbackBounds,
    screen.getAllDisplays().map((display) => display.workArea),
  );
}

function writeWindowState(window: BrowserWindow) {
  if (window.isDestroyed()) return;
  try {
    const statePath = getWindowStatePath();
    const state: PersistedWindowState = {
      bounds: window.getBounds(),
      isMaximized: window.isMaximized(),
    };

    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2));
  } catch (error) {
    writeLog('main', 'failed to persist window state', error, 'warn');
  }
}

export function persistWindowState(window: BrowserWindow) {
  let timeout: NodeJS.Timeout | null = null;

  const scheduleWrite = () => {
    if (window.isDestroyed()) {
      return;
    }

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      timeout = null;
      writeWindowState(window);
    }, 250);
  };

  window.on('resize', scheduleWrite);
  window.on('move', scheduleWrite);
  window.on('maximize', scheduleWrite);
  window.on('unmaximize', scheduleWrite);
  const clearPendingWrite = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  window.on('close', () => {
    clearPendingWrite();
    writeWindowState(window);
  });
  window.once('closed', clearPendingWrite);
}
