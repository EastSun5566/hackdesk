import { getHackDeskAPI, getRuntimeEnvironment, type CheckForUpdatesResult } from './electron-api';

export async function checkForUpdatesForRuntime(): Promise<CheckForUpdatesResult> {
  const runtime = getRuntimeEnvironment();

  if (runtime === 'electron') {
    const api = getHackDeskAPI();
    if (!api) {
      throw new Error('Electron update API is unavailable.');
    }

    return api.app.checkForUpdates();
  }

  throw new Error('Update checks are only available in the desktop app.');
}
