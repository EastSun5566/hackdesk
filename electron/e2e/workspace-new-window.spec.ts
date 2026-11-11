import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';
import { runCommand } from './fixtures/hackdesk';

const repoRoot = resolve(import.meta.dirname, '../..');
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';
const modifierHint = process.platform === 'darwin' ? '⌘-click' : 'Ctrl-click';

async function launch(home: string) {
  const env = { ...definedEnvironment(process.env) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  await expect.poll(() => app.windows().some((page) => page.url().includes('#/electron'))).toBe(true);
  const page = app.windows().find((candidate) => candidate.url().includes('#/electron'))!;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return { app, page, appProcess: app.process() };
}

async function stop(app: ElectronApplication) {
  if (app.process().exitCode !== null) return;
  const exited = new Promise<void>((done) => app.process().once('exit', () => done()));
  app.process().kill('SIGKILL');
  await exited;
}

async function launchWithVault() {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-workspace-window-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault, { recursive: true });
  await writeFile(join(vault, 'Note.md'), '# Note\n\nOnly in the vault.');
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings,
    localVault: { vaults: [{ id: 'vault-e2e', path: vault }], activeVaultId: 'vault-e2e' },
    onboarding: { hackmdTokenSetupDeferred: true },
  }));
  return { home, ...(await launch(home)) };
}

function mainWindows(app: ElectronApplication) {
  return app.windows().filter((candidate) => candidate.url().includes('#/electron'));
}

async function waitForSecondWindow(app: ElectronApplication) {
  await expect.poll(() => mainWindows(app).length).toBe(2);
  const second = mainWindows(app).find((candidate) => candidate.url().includes('workspace='))!;
  await second.waitForLoadState('domcontentloaded').catch(() => undefined);
  return second;
}

async function openSwitcher(page: Page) {
  await page.getByRole('button', { name: /^Switch workspace, current: / }).click();
  return page.getByRole('dialog', { name: 'Workspaces' });
}

// History now lives in the sidebar rather than the switcher, so a switcher row stands in for it.
test('opens a workspace in a new window with a modifier-click', async () => {
  const { app, page, appProcess } = await launchWithVault();
  try {
    const dialog = await openSwitcher(page);
    await dialog.getByRole('button', { name: 'My Workspace', exact: true }).click({ modifiers: [primary] });

    const second = await waitForSecondWindow(app);
    expect(second.url()).toContain('workspace=');
    await expect(second.getByRole('button', { name: 'Switch workspace, current: My Workspace' })).toBeVisible();
    // The first window stays where it was.
    await expect(page.getByRole('button', { name: /^Switch workspace, current: vault/ })).toBeVisible();
  } finally { if (appProcess.exitCode === null) await stop(app); }
});

test('opens the vault in a new window from its hover button', async () => {
  const { app, page, appProcess } = await launchWithVault();
  try {
    const dialog = await openSwitcher(page);
    const row = dialog.getByRole('button', { name: 'My Workspace', exact: true });
    await row.hover();
    await dialog.getByRole('button', { name: `Open My Workspace in a new window (${modifierHint})` }).click();

    const second = await waitForSecondWindow(app);
    expect(second.url()).toContain('workspace=');
    await expect(second.getByRole('button', { name: 'Switch workspace, current: My Workspace' })).toBeVisible();
  } finally { if (appProcess.exitCode === null) await stop(app); }
});

// Each window works on its own folder. Opening another folder in a new window makes it the app-wide
// active folder, and a note created in the first window must still land in the first window's.
test('a window keeps writing to its own folder after another window opens a different one', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-two-folders-'));
  const alpha = join(home, 'alpha');
  const beta = join(home, 'beta');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(alpha);
  await mkdir(beta);
  await writeFile(join(alpha, 'In alpha.md'), '# In alpha\n');
  await writeFile(join(beta, 'In beta.md'), '# In beta\n');
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings,
    localVault: { vaults: [{ id: 'vault-alpha', path: alpha }, { id: 'vault-beta', path: beta }], activeVaultId: 'vault-alpha' },
    onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const { app, page, appProcess } = await launch(home);
  try {
    await expect(page.getByRole('button', { name: /^Switch workspace, current: alpha/ })).toBeVisible();
    const switcher = await openSwitcher(page);
    await switcher.getByRole('button', { name: 'beta', exact: true }).hover();
    await switcher.getByRole('button', { name: `Open beta in a new window (${modifierHint})` }).click();
    const second = await waitForSecondWindow(app);
    await expect(second.getByRole('treeitem', { name: /^In beta/ })).toBeVisible();

    await page.bringToFront();
    await runCommand(page, 'New Note');
    await page.locator('.cm-content').fill('# Written in alpha');
    await page.keyboard.press(`${primary}+s`);
    await expect(page.getByRole('tab', { name: 'Written in alpha', exact: true, selected: true })).toBeVisible();

    await expect.poll(async () => (await readdir(alpha)).filter((name) => name.endsWith('.md')).sort()).toEqual(['In alpha.md', 'Written in alpha.md']);
    expect((await readdir(beta)).filter((name) => name.endsWith('.md'))).toEqual(['In beta.md']);
  } finally { if (appProcess.exitCode === null) await stop(app); }
});
