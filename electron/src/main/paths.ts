import { app } from 'electron';
import { join } from 'node:path';

import { ROOT, SETTINGS_NAME } from '../../../src/constants';
export { getRendererEntryUrl } from './renderer-url';

export function getHackDeskRootPath() {
  return join(app.getPath('home'), ROOT);
}

export function getSettingsPath() {
  return join(getHackDeskRootPath(), SETTINGS_NAME);
}
