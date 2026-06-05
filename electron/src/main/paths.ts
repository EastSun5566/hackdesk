import { app } from 'electron';
import { join } from 'node:path';

import { ROOT, SETTINGS_NAME } from '../../../src/constants';

export function getHackDeskRootPath() {
  return join(app.getPath('home'), ROOT);
}

export function getSettingsPath() {
  return join(getHackDeskRootPath(), SETTINGS_NAME);
}

export function getRendererEntryUrl() {
  const devServerUrl = process.env.HACKDESK_ELECTRON_DEV_SERVER_URL;

  if (devServerUrl) {
    return `${devServerUrl.replace(/\/$/, '')}/#/electron`;
  }

  return `file://${join(__dirname, '../../dist/index.html')}#/electron`;
}
