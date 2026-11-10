import { contextBridge, ipcRenderer } from 'electron';

import type { HackDeskPresentationAPI } from '../../../src/lib/electron-api';
import { ELECTRON_CHANNELS } from '../shared/channels';

const api: HackDeskPresentationAPI = {
  getDeck: () => ipcRenderer.invoke(ELECTRON_CHANNELS.appGetPresentation),
  close: () => ipcRenderer.invoke(ELECTRON_CHANNELS.appClosePresentation),
  toggleFullScreen: () => ipcRenderer.invoke(ELECTRON_CHANNELS.appTogglePresentationFullScreen),
  onFullScreenChange: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, state: { fullScreen: boolean }) => listener(state.fullScreen);
    ipcRenderer.on(ELECTRON_CHANNELS.appPresentationFullScreenChanged, handler);
    return () => {
      ipcRenderer.removeListener(ELECTRON_CHANNELS.appPresentationFullScreenChanged, handler);
    };
  },
};

contextBridge.exposeInMainWorld('hackdeskPresentationAPI', api);
