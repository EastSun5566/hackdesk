/// <reference types="vite/client" />

import type { HackDeskElectronAPI } from './lib/electron-api';

declare global {
  interface Window {
    hackdeskAPI?: HackDeskElectronAPI;
    __TAURI__?: unknown;
  }
}
