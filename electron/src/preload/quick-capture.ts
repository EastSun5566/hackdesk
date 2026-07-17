import { contextBridge, ipcRenderer } from 'electron';

import type { HackDeskQuickCaptureAPI } from '../../../src/lib/electron-api';
import { ELECTRON_CHANNELS } from '../shared/channels';

const api: HackDeskQuickCaptureAPI = {
  submit: (content) => ipcRenderer.invoke(ELECTRON_CHANNELS.appSubmitQuickCapture, content),
  hide: () => ipcRenderer.invoke(ELECTRON_CHANNELS.appHideQuickCapture),
};

contextBridge.exposeInMainWorld('hackdeskQuickCaptureAPI', api);
