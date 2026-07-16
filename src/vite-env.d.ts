/// <reference types="vite/client" />

import type { HackDeskElectronAPI } from './lib/electron-api';

declare global {
  interface Window {
    hackdeskAPI?: HackDeskElectronAPI;
    hackdeskQuickCaptureAPI?: import('./lib/electron-api').HackDeskQuickCaptureAPI;
  }
}
