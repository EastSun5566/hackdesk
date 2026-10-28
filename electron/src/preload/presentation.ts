import { contextBridge, ipcRenderer } from 'electron';

import type { HackDeskPresentationAPI } from '../../../src/lib/electron-api';
import { ELECTRON_CHANNELS } from '../shared/channels';

const api: HackDeskPresentationAPI = {
  getDeck: () => ipcRenderer.invoke(ELECTRON_CHANNELS.appGetPresentation),
  close: () => ipcRenderer.invoke(ELECTRON_CHANNELS.appClosePresentation),
};

contextBridge.exposeInMainWorld('hackdeskPresentationAPI', api);
