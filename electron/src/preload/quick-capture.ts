import { contextBridge, ipcRenderer } from 'electron';

import type { HackDeskQuickCaptureAPI, QuickCaptureState } from '../../../src/lib/electron-api';
import { ELECTRON_CHANNELS } from '../shared/channels';

const api: HackDeskQuickCaptureAPI = {
  submit: (content) => ipcRenderer.invoke(ELECTRON_CHANNELS.appSubmitQuickCapture, content),
  hide: () => ipcRenderer.invoke(ELECTRON_CHANNELS.appHideQuickCapture),
  getState: () => ipcRenderer.invoke(ELECTRON_CHANNELS.appGetQuickCaptureState),
  setPinned: (pinned) => ipcRenderer.invoke(ELECTRON_CHANNELS.appSetQuickCapturePinned, pinned),
  onStateChange: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: QuickCaptureState) => listener(state);
    ipcRenderer.on(ELECTRON_CHANNELS.appQuickCaptureStateChanged, handler);
    return () => {
      ipcRenderer.removeListener(ELECTRON_CHANNELS.appQuickCaptureStateChanged, handler);
    };
  },
};

contextBridge.exposeInMainWorld('hackdeskQuickCaptureAPI', api);
