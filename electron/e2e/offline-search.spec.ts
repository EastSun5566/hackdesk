import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');

function environment(extra: Record<string, string> = {}) {
  const env = { ...definedEnvironment(process.env), ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  return env;
}

test('a HackMD note opened once can be read and searched after restarting offline', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-offline-'));
  await mkdir(join(home, '.hackdesk'));
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings, hackmdApiToken: 'synthetic-fixture-token', onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const launch = (offline: boolean) => electron.launch({
    args: [join(repoRoot, 'electron/e2e/fixtures/hackmd-offline-network.cjs'), `--hackdesk-home=${home}`, `--user-data-dir=${join(home, 'user-data')}`],
    cwd: repoRoot,
    env: environment(offline ? { HACKDESK_FIXTURE_OFFLINE: '1' } : {}),
  });

  const online = await launch(false);
  try {
    const page = await online.firstWindow();
    await page.getByRole('treeitem', { name: /Alpha/ }).first().click();
    await expect(page.locator('.cm-content')).toContainText('quarterly roadmap');
  } finally {
    await online.close();
  }

  const offline = await launch(true);
  try {
    const page = await offline.firstWindow();
    await page.getByRole('treeitem', { name: /Alpha/ }).first().click();
    await expect(page.locator('.cm-content')).toContainText('quarterly roadmap');
    // The copy on this computer may be behind HackMD, and the toolbar says so.
    await expect(page.getByRole('status', { name: 'Sync state: Cached' })).toBeVisible();

    await page.getByPlaceholder('Search notes').fill('roadmap');
    const results = page.getByRole('list', { name: 'Search results' });
    await expect(results.locator('mark')).toHaveText('roadmap');
    await expect(results.locator('[data-note-id="note-a"]')).toBeVisible();
    // Beta was listed but never opened, so its text is unknown.
    await expect(page.getByText("Searched the text of 1 note you've opened.")).toBeVisible();
  } finally {
    await offline.close();
  }
});

test('Search notes finds Local Vault notes by their text', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-vault-search-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault);
  await writeFile(join(vault, 'Planning.md'), '# Planning\n\nWe agreed on the 離線閱讀 milestone and a budget review.\n');
  await writeFile(join(vault, 'Other.md'), '# Other\n\nNothing related.\n');
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings, localVault: { path: vault }, onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env: environment() });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('treeitem', { name: /Planning/ }).first()).toBeVisible();
    await page.getByPlaceholder('Search notes').fill('離線閱讀');
    const results = page.getByRole('list', { name: 'Search results' });
    await expect(results.locator('mark')).toHaveText('離線閱讀');
    await expect(results.getByText('Planning')).toBeVisible();
    await expect(results.getByText('Other')).toHaveCount(0);
    await expect(page.getByText(/Searched the text of/)).toHaveCount(0);
  } finally {
    await app.close();
  }
});
