import { getHackDeskAPI, getRuntimeEnvironment } from './electron-api';

export function getDesktopAPI() {
  const runtime = getRuntimeEnvironment();

  if (runtime !== 'electron') {
    return undefined;
  }

  return getHackDeskAPI();
}
