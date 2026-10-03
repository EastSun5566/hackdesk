import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');
const DAMAGED = '{"title":"Workspace","hackmdApiTokenEncrypted":{"version":1},"localVault":{"path":"/tmp/vault"}';

// Native message boxes cannot be clicked from Playwright, so a preloaded stub answers them in order.
const DIALOG_STUB = `
const { dialog } = require('electron');
const { appendFileSync } = require('node:fs');
const responses = JSON.parse(process.env.HACKDESK_E2E_DIALOG_RESPONSES);
dialog.showMessageBox = async (options) => {
  appendFileSync(process.env.HACKDESK_E2E_DIALOG_LOG, JSON.stringify(options.message) + '\\n');
  return { response: responses.shift() ?? 3 };
};
`;

async function launchWithDamagedSettings(responses: number[]) {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-smoke-'));
  const settingsDir = join(home, '.hackdesk');
  await mkdir(settingsDir, { recursive: true });
  await writeFile(join(settingsDir, 'settings.json'), DAMAGED);
  const stub = join(home, 'dialog-stub.cjs');
  const dialogLog = join(home, 'dialogs.log');
  await writeFile(stub, DIALOG_STUB);
  await writeFile(dialogLog, '');
  const app = await electron.launch({
    args: ['-r', stub, repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`],
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      HACKDESK_E2E_DIALOG_RESPONSES: JSON.stringify(responses),
      HACKDESK_E2E_DIALOG_LOG: dialogLog,
    },
  });
  const readDialogs = async () => (await readFile(dialogLog, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as string);
  return { app, settingsDir, readDialogs };
}

test('quitting damaged settings recovery leaves the file unchanged and opens no window', async () => {
  const { app, settingsDir, readDialogs } = await launchWithDamagedSettings([3]);
  const child = app.process();
  try {
    const exitCode = child.exitCode ?? await new Promise<number | null>((resolveExit) => child.once('exit', resolveExit));
    expect(exitCode).toBe(0);
    expect(await readDialogs()).toEqual(['HackDesk could not load its settings.']);
    expect(await readFile(join(settingsDir, 'settings.json'), 'utf8')).toBe(DAMAGED);
    expect(await readdir(settingsDir)).toEqual(['settings.json']);
  } finally {
    child.kill('SIGKILL');
  }
});

test('confirmed reset backs up damaged settings and opens the app with valid defaults', async () => {
  const { app, settingsDir, readDialogs } = await launchWithDamagedSettings([2, 0, 0]);
  try {
    const main = await app.firstWindow();
    await expect(main.locator('body')).toContainText('HackMD');
    expect(await readDialogs()).toEqual([
      'HackDesk could not load its settings.',
      'Back up and reset settings?',
      'Settings were reset.',
    ]);
    const files = await readdir(settingsDir);
    const backup = files.find((file) => file.startsWith('settings.json.damaged-'));
    expect(backup).toBeDefined();
    expect(await readFile(join(settingsDir, backup!), 'utf8')).toBe(DAMAGED);
    expect(JSON.parse(await readFile(join(settingsDir, 'settings.json'), 'utf8'))).toMatchObject({ localVault: { path: null } });
  } finally {
    app.process().kill('SIGKILL');
  }
});
