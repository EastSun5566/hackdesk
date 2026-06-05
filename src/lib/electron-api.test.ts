import { afterEach, describe, expect, it } from 'vitest';

import { getRuntimeEnvironment, type HackDeskElectronAPI } from './electron-api';

describe('Electron API runtime detection', () => {
  afterEach(() => {
    delete window.hackdeskAPI;
    delete window.__TAURI__;
  });

  it('detects Electron before Tauri when preload exposed hackdeskAPI', () => {
    window.__TAURI__ = {};
    window.hackdeskAPI = { getRuntimeEnvironment: () => 'electron' } as HackDeskElectronAPI;

    expect(getRuntimeEnvironment()).toBe('electron');
  });

  it('detects Tauri when the Tauri global is present', () => {
    window.__TAURI__ = {};

    expect(getRuntimeEnvironment()).toBe('tauri');
  });

  it('falls back to web outside desktop runtimes', () => {
    expect(getRuntimeEnvironment()).toBe('web');
  });
});
