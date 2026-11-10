import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');
const primary = process.platform === 'darwin' ? 'Meta' : 'Control';

async function launch(home: string) {
  const env: Record<string, string> = { ...definedEnvironment(process.env), HOME: home };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  await expect.poll(() => app.windows().some((page) => page.url().includes('#/electron'))).toBe(true);
  const page = app.windows().find((candidate) => candidate.url().includes('#/electron'))!;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return { app, page };
}

async function stop(app: ElectronApplication) {
  if (app.process().exitCode !== null) return;
  const exited = new Promise<void>((done) => app.process().once('exit', () => done()));
  app.process().kill('SIGKILL');
  await exited;
}

async function openVaultSettings(page: Page) {
  await page.keyboard.press(`${primary}+,`);
  await page.getByRole('tab', { name: 'Vault', exact: true }).click();
}

test('a named local workspace groups folders under one root and survives a restart', async () => {
  test.setTimeout(120_000);
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-local-workspace-'));
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(join(home, 'A'));
  await mkdir(join(home, 'B'));
  const vaultA = await realpath(join(home, 'A'));
  const vaultB = await realpath(join(home, 'B'));
  await writeFile(join(vaultA, 'A note.md'), '# A note\n\nOnly in A.');
  await writeFile(join(vaultB, 'B note.md'), '# B note\n\nOnly in B.');
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings,
    localVault: {
      vaults: [{ id: 'vault-a', path: vaultA }, { id: 'vault-b', path: vaultB }],
      activeVaultId: 'vault-a',
      workspaces: [],
      activeWorkspaceId: null,
    },
    onboarding: { hackmdTokenSetupDeferred: true },
  }));

  let { app, page } = await launch(home);
  try {
    await expect(page.locator('.cm-content')).toContainText('Only in A.');
    // Without a workspace the root is the open folder.
    await expect(page.getByRole('button', { name: 'Collapse A', exact: true })).toBeVisible();

    await openVaultSettings(page);
    // The create form stays folded away until asked for.
    await page.getByRole('button', { name: 'New workspace', exact: true }).click();
    const form = page.getByRole('group', { name: 'Create a workspace' });
    await form.getByLabel('Workspace name', { exact: true }).fill('Work');
    await form.getByLabel('A', { exact: true }).check();
    await form.getByLabel('B', { exact: true }).check();
    await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit workspace Work', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    // The root takes the workspace name, and the other folder sits beside it as a root row.
    await expect(page.getByRole('button', { name: 'Collapse Work', exact: true })).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('Only in A.');
    await page.getByRole('button', { name: 'Open B', exact: true }).click();
    await expect(page.locator('.cm-content')).toContainText('Only in B.');
    await expect(page.getByRole('button', { name: 'Collapse Work', exact: true })).toBeVisible();

    await page.getByRole('button', { name: /^Switch workspace, current: Work/ }).click();
    await expect(page.getByRole('dialog', { name: 'Workspaces' }).getByRole('button', { name: 'Work', exact: true }))
      .toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Escape');
  } finally {
    await stop(app);
  }

  // The named working set is stored settings, so the next launch opens onto it.
  ({ app, page } = await launch(home));
  try {
    await expect(page.getByRole('button', { name: 'Collapse Work', exact: true })).toBeVisible();
    await expect(page.locator('.cm-content')).toContainText('Only in B.');

    // Deleting the set leaves its folders known; the root falls back to the open folder.
    await openVaultSettings(page);
    await page.getByRole('button', { name: 'Delete workspace Work', exact: true }).click();
    await expect(page.getByText('No local vault configured')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Collapse B', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open A', exact: true })).toHaveCount(0);
  } finally {
    await stop(app);
  }
});
