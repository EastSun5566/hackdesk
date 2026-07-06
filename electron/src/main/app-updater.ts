import { app, dialog } from 'electron';
import type { BrowserWindow, MessageBoxOptions } from 'electron';
import electronUpdater, { type AppUpdater, type UpdateInfo } from 'electron-updater';

import type { CheckForUpdatesResult } from '../../../src/lib/electron-api';
import { writeLog } from './logging';

const { autoUpdater } = electronUpdater;

export const ELECTRON_UPDATE_FEED_URL = 'https://hackdesk.eastsun.me/electron-updates/';
const MAX_RELEASE_NOTES_LENGTH = 800;

type UpdaterLogger = {
  info: (message?: unknown, ...details: unknown[]) => void;
  warn: (message?: unknown, ...details: unknown[]) => void;
  error: (message?: unknown, ...details: unknown[]) => void;
  debug: (message?: unknown, ...details: unknown[]) => void;
};

type UpdaterLike = Pick<
  AppUpdater,
  | 'autoDownload'
  | 'autoInstallOnAppQuit'
  | 'autoRunAppAfterInstall'
  | 'logger'
  | 'setFeedURL'
  | 'checkForUpdates'
  | 'downloadUpdate'
>;

type ShowMessageBox = (
  browserWindow: BrowserWindow | null | undefined,
  options: MessageBoxOptions,
) => Promise<Electron.MessageBoxReturnValue>;

type ElectronUpdaterServiceDependencies = {
  isPackaged: () => boolean;
  getUpdater: () => UpdaterLike;
  showMessageBox: ShowMessageBox;
  writeLog: typeof writeLog;
  feedUrl?: string;
};

function serializeDetails(details: unknown[]) {
  return details.length === 0 ? undefined : details.map((detail) => (
    detail instanceof Error
      ? { message: detail.message, stack: detail.stack }
      : detail
  ));
}

export function createUpdaterLogger(writeLogFn: typeof writeLog): UpdaterLogger {
  const log = (level: 'info' | 'warn' | 'error', message?: unknown, ...details: unknown[]) => {
    writeLogFn('updater', message == null ? '' : String(message), serializeDetails(details), level);
  };

  return {
    info: (message, ...details) => {
      log('info', message, ...details);
    },
    warn: (message, ...details) => {
      log('warn', message, ...details);
    },
    error: (message, ...details) => {
      log('error', message, ...details);
    },
    debug: (message, ...details) => {
      log('info', message, ...details);
    },
  };
}

function normalizeReleaseNotes(releaseNotes: UpdateInfo['releaseNotes']) {
  if (!releaseNotes) {
    return '';
  }

  const text = Array.isArray(releaseNotes)
    ? releaseNotes.map((note) => note.note).filter(Boolean).join('\n\n')
    : releaseNotes;

  const trimmed = text.trim();
  if (trimmed.length <= MAX_RELEASE_NOTES_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_RELEASE_NOTES_LENGTH).trimEnd()}...`;
}

function buildUpdatePromptOptions(updateInfo: UpdateInfo): MessageBoxOptions {
  const releaseNotes = normalizeReleaseNotes(updateInfo.releaseNotes);
  const detail = releaseNotes
    ? `Release notes:\n\n${releaseNotes}`
    : 'Download this update now. It will be installed after you quit and reopen HackDesk.';

  return {
    type: 'question',
    title: 'HackDesk Update',
    message: `HackDesk ${updateInfo.version} is available.`,
    detail,
    buttons: ['Install', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  };
}

export class ElectronUpdaterService {
  private configured = false;
  private checking = false;
  private readonly feedUrl: string;

  constructor(private readonly dependencies: ElectronUpdaterServiceDependencies) {
    this.feedUrl = dependencies.feedUrl ?? ELECTRON_UPDATE_FEED_URL;
  }

  async checkForUpdates(parentWindow?: BrowserWindow | null): Promise<CheckForUpdatesResult> {
    if (!this.dependencies.isPackaged()) {
      throw new Error('Update checks are only available in packaged Electron builds.');
    }

    if (this.checking) {
      throw new Error('An update check is already running.');
    }

    this.checking = true;
    const updater = this.configureUpdater();

    try {
      this.dependencies.writeLog('updater', 'checking for Electron update', { feedUrl: this.feedUrl });
      const result = await updater.checkForUpdates();

      if (!result?.isUpdateAvailable) {
        this.dependencies.writeLog('updater', 'Electron app is up to date');
        return { status: 'upToDate' };
      }

      const updateInfo = result.updateInfo;
      const version = updateInfo.version;
      const { response } = await this.dependencies.showMessageBox(parentWindow, buildUpdatePromptOptions(updateInfo));
      if (response !== 0) {
        this.dependencies.writeLog('updater', 'Electron update declined', { version });
        return { status: 'declined', version };
      }

      this.dependencies.writeLog('updater', 'downloading Electron update', { version });
      await updater.downloadUpdate();
      this.dependencies.writeLog('updater', 'Electron update downloaded', { version });
      return { status: 'installed', version, restart_required: true };
    } catch (error) {
      this.dependencies.writeLog('updater', 'Electron update check failed', {
        error: error instanceof Error ? error.message : String(error),
      }, 'error');
      throw error;
    } finally {
      this.checking = false;
    }
  }

  private configureUpdater() {
    const updater = this.dependencies.getUpdater();

    if (!this.configured) {
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = true;
      updater.autoRunAppAfterInstall = true;
      updater.logger = createUpdaterLogger(this.dependencies.writeLog);
      updater.setFeedURL({
        provider: 'generic',
        url: this.feedUrl,
      });
      this.configured = true;
    }

    return updater;
  }
}

const electronUpdaterService = new ElectronUpdaterService({
  isPackaged: () => app.isPackaged,
  getUpdater: () => autoUpdater,
  showMessageBox: (parentWindow, options) => (
    parentWindow ? dialog.showMessageBox(parentWindow, options) : dialog.showMessageBox(options)
  ),
  writeLog,
});

export function checkForElectronUpdates(parentWindow?: BrowserWindow | null) {
  return electronUpdaterService.checkForUpdates(parentWindow);
}
