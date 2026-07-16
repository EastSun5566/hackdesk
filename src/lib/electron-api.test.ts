import { afterEach, describe, expect, it } from 'vitest';

import {
  getRuntimeEnvironment,
  type HackDeskElectronAPI,
  type HackDeskQuickCaptureAPI,
} from './electron-api';

describe('Electron API runtime detection', () => {
  afterEach(() => {
    delete window.hackdeskAPI;
    delete window.hackdeskQuickCaptureAPI;
  });

  it('detects Electron from the minimal Quick Capture preload', () => {
    window.hackdeskQuickCaptureAPI = {} as HackDeskQuickCaptureAPI;

    expect(getRuntimeEnvironment()).toBe('electron');
  });

  it('detects Electron when preload exposed hackdeskAPI', () => {
    window.hackdeskAPI = { getRuntimeEnvironment: () => 'electron' } as HackDeskElectronAPI;

    expect(getRuntimeEnvironment()).toBe('electron');
  });

  it('falls back to web outside desktop runtimes', () => {
    expect(getRuntimeEnvironment()).toBe('web');
  });
});
