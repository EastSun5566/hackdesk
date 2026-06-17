import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

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

import { exportDebugLogs, initLogging, safeLogName, writeLog } from './logging';
import { createZipArchive } from './zip-archive';

describe('logging helpers', () => {
  it('keeps log file names filesystem-safe', () => {
    expect(safeLogName('Renderer Fatal/Error')).toBe('renderer-fatal-error');
    expect(safeLogName('ipc.handlers')).toBe('ipc.handlers');
  });

  it('creates a zip archive with named entries', () => {
    const archive = createZipArchive([
      { name: 'manifest.json', data: Buffer.from('{"ok":true}') },
      { name: 'logs/main.log', data: Buffer.from('hello') },
    ]);

    expect(archive.subarray(0, 4).toString('latin1')).toBe('PK\u0003\u0004');
    expect(archive.toString('latin1')).toContain('manifest.json');
    expect(archive.toString('latin1')).toContain('logs/main.log');
  });

  it('exports debug logs as a zip file', async () => {
    initLogging();
    writeLog('renderer', 'test log line');

    const outputPath = await exportDebugLogs();
    const archive = readFileSync(outputPath);

    expect(outputPath).toMatch(/hackdesk-debug-.*\.zip$/);
    expect(archive.subarray(0, 4).toString('latin1')).toBe('PK\u0003\u0004');
    expect(archive.toString('latin1')).toContain('manifest.json');
    expect(archive.toString('latin1')).toContain('logs/');
  }, 15_000);
});
