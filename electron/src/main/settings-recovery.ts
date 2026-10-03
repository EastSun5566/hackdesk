import { dialog, shell } from 'electron';

import { writeLog } from './logging';
import { inspectSettingsFile, resetDamagedSettingsFile, type SettingsFileProblem } from './settings';

type MessageBoxOptions = Electron.MessageBoxOptions;

export type SettingsRecoveryDependencies = {
  inspect: () => Promise<SettingsFileProblem | null>;
  reset: () => Promise<{ backupPath: string } | null>;
  reveal: (path: string) => void;
  showMessageBox: (options: MessageBoxOptions) => Promise<{ response: number }>;
};

const defaultDependencies: SettingsRecoveryDependencies = {
  inspect: inspectSettingsFile,
  reset: resetDamagedSettingsFile,
  reveal: (path) => shell.showItemInFolder(path),
  showMessageBox: (options) => dialog.showMessageBox(options),
};

const TRY_AGAIN = 0;
const REVEAL = 1;
const RESET = 2;
const QUIT = 3;

function describeProblem(problem: SettingsFileProblem) {
  return problem.kind === 'invalid'
    ? `The settings file is not valid (${problem.message}).`
    : `The settings file could not be read (${problem.message}).`;
}

async function confirmReset(problem: SettingsFileProblem, deps: SettingsRecoveryDependencies) {
  const { response } = await deps.showMessageBox({
    type: 'warning',
    title: 'Reset HackDesk Settings',
    message: 'Back up and reset settings?',
    detail: `The damaged file will be renamed and kept next to the new one:\n${problem.path}\n\nHackDesk then starts with default settings. Connect HackMD and open your Local Vault again afterwards.`,
    buttons: ['Back Up and Reset', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  return response === 0;
}

/**
 * Resolves true when settings can be read, or false when the user chose to quit.
 * The original file is changed only by an explicitly confirmed reset.
 */
export async function ensureReadableSettings(deps: SettingsRecoveryDependencies = defaultDependencies): Promise<boolean> {
  for (;;) {
    const problem = await deps.inspect();
    if (!problem) return true;
    writeLog('settings', `settings file needs recovery (${problem.kind})`, problem.message, 'error');

    const { response } = await deps.showMessageBox({
      type: 'error',
      title: 'HackDesk Settings',
      message: 'HackDesk could not load its settings.',
      detail: `${describeProblem(problem)}\n\n${problem.path}\n\nFix the file and choose Try Again, or back it up and reset. Revealing the file or quitting does not change it.`,
      buttons: ['Try Again', 'Reveal Settings File', 'Back Up and Reset…', 'Quit'],
      defaultId: TRY_AGAIN,
      cancelId: QUIT,
      noLink: true,
    });

    if (response === REVEAL) {
      deps.reveal(problem.path);
    } else if (response === RESET) {
      if (!await confirmReset(problem, deps)) continue;
      try {
        const result = await deps.reset();
        if (result) {
          writeLog('settings', 'reset damaged settings file', result.backupPath);
          await deps.showMessageBox({
            type: 'info',
            title: 'HackDesk Settings',
            message: 'Settings were reset.',
            detail: `The damaged file was saved as:\n${result.backupPath}`,
            buttons: ['Continue'],
            noLink: true,
          });
        }
      } catch (error) {
        writeLog('settings', 'failed to reset damaged settings file', error, 'error');
        await deps.showMessageBox({
          type: 'error',
          title: 'HackDesk Settings',
          message: 'Settings could not be reset.',
          detail: error instanceof Error ? error.message : String(error),
          buttons: ['OK'],
          noLink: true,
        });
      }
    } else if (response !== TRY_AGAIN) {
      return false;
    }
  }
}
