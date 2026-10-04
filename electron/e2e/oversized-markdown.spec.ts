import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');

test('keeps a Local Vault usable when one Markdown file is over 10 MiB', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-oversized-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(join(vault, 'Archive'), { recursive: true });
  await writeFile(join(vault, 'Normal.md'), '# Normal\n\nNormal body');
  await writeFile(join(vault, 'Archive', 'Huge.md'), 'x'.repeat(10 * 1024 * 1024 + 1));
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings, localVault: { path: vault }, onboarding: { hackmdTokenSetupDeferred: true },
  }));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  const child = app.process();
  try {
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await expect(page.locator('.cm-content')).toContainText('Normal body');
    await expect(page.getByText('1 file was not loaded.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Files not loaded' })).toHaveText('Archive/Huge.md — Larger than 10 MiB');
    await expect(page.getByRole('button', { name: /Huge/ })).toHaveCount(0);
  } finally {
    child.kill('SIGKILL');
  }
});
