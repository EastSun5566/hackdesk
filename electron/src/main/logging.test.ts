import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getName: () => 'HackDesk',
    getPath: () => '/tmp/hackdesk-test',
    getVersion: () => '0.0.0-test',
    setPath: vi.fn(),
  },
  crashReporter: {
    start: vi.fn(),
  },
  shell: {
    showItemInFolder: vi.fn(),
  },
}));

import { safeLogName } from './logging';

describe('logging helpers', () => {
  it('keeps log file names filesystem-safe', () => {
    expect(safeLogName('Renderer Fatal/Error')).toBe('renderer-fatal-error');
    expect(safeLogName('ipc.handlers')).toBe('ipc.handlers');
  });
});
