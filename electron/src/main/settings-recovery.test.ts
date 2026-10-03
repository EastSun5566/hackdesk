import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ dialog: {}, shell: {} }));
vi.mock('./logging', () => ({ writeLog: vi.fn() }));
vi.mock('./settings', () => ({ inspectSettingsFile: vi.fn(), resetDamagedSettingsFile: vi.fn() }));

import { ensureReadableSettings, type SettingsRecoveryDependencies } from './settings-recovery';
import type { SettingsFileProblem } from './settings';

const problem: SettingsFileProblem = { kind: 'invalid', message: 'Invalid JSON format', path: '/home/me/.hackdesk/settings.json' };
const TRY_AGAIN = 0;
const REVEAL = 1;
const RESET = 2;
const QUIT = 3;
const CONFIRM = 0;
const CANCEL = 1;

function createDeps(responses: number[], inspections: (SettingsFileProblem | null)[]) {
  const deps = {
    inspect: vi.fn(async () => (inspections.length > 1 ? inspections.shift() : inspections[0]) ?? null),
    reset: vi.fn(async () => ({ backupPath: `${problem.path}.damaged-1` })),
    reveal: vi.fn(),
    showMessageBox: vi.fn(async () => ({ response: responses.shift() ?? QUIT })),
  } satisfies SettingsRecoveryDependencies;
  return deps;
}

describe('ensureReadableSettings', () => {
  it('starts without a dialog when settings are readable', async () => {
    const deps = createDeps([], [null]);
    await expect(ensureReadableSettings(deps)).resolves.toBe(true);
    expect(deps.showMessageBox).not.toHaveBeenCalled();
  });

  it('explains the problem with the file path and quits without changing it', async () => {
    const deps = createDeps([QUIT], [problem]);
    await expect(ensureReadableSettings(deps)).resolves.toBe(false);
    expect(deps.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.stringContaining(problem.path),
      buttons: ['Try Again', 'Reveal Settings File', 'Back Up and Reset…', 'Quit'],
      cancelId: QUIT,
    }));
    expect(deps.reset).not.toHaveBeenCalled();
  });

  it('reveals the file and continues once the user fixed it and tries again', async () => {
    const deps = createDeps([REVEAL, TRY_AGAIN], [problem, problem, null]);
    await expect(ensureReadableSettings(deps)).resolves.toBe(true);
    expect(deps.reveal).toHaveBeenCalledWith(problem.path);
    expect(deps.reset).not.toHaveBeenCalled();
  });

  it('resets only after explicit confirmation and reports the backup path', async () => {
    const deps = createDeps([RESET, CANCEL, RESET, CONFIRM, 0], [problem, problem, null]);
    await expect(ensureReadableSettings(deps)).resolves.toBe(true);
    expect(deps.reset).toHaveBeenCalledOnce();
    expect(deps.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ message: 'Back up and reset settings?', defaultId: CANCEL, cancelId: CANCEL }));
    expect(deps.showMessageBox).toHaveBeenLastCalledWith(expect.objectContaining({ detail: expect.stringContaining(`${problem.path}.damaged-1`) }));
  });

  it('shows a failed reset and offers recovery again', async () => {
    const deps = createDeps([RESET, CONFIRM, 0, QUIT], [problem]);
    deps.reset.mockRejectedValueOnce(new Error('EACCES: permission denied'));
    await expect(ensureReadableSettings(deps)).resolves.toBe(false);
    expect(deps.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({ message: 'Settings could not be reset.', detail: 'EACCES: permission denied' }));
    expect(deps.showMessageBox).toHaveBeenCalledTimes(4);
  });
});
