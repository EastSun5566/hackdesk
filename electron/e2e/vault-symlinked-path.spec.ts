import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');

// macOS resolves /var to /private/var, and Windows can resolve short names and letter case, so the
// root a scan reports can differ from the path stored in settings. The app must not tell folders
// apart by comparing the two.
test('a folder stored through a symlinked parent opens and shows its notes', async () => {
  const real = await mkdtemp(join(tmpdir(), 'hackdesk-symlinked-'));
  const home = `${real}-link`;
  // A junction needs no admin rights on Windows.
  await symlink(real, home, process.platform === 'win32' ? 'junction' : 'dir');
  const vault = join(home, 'vault');
  await mkdir(vault);
  await writeFile(join(vault, 'Linked note.md'), '# Linked note\n');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings,
    localVault: { vaults: [{ id: 'vault-e2e', path: vault }], activeVaultId: 'vault-e2e' },
    onboarding: { hackmdTokenSetupDeferred: true },
  }));

  const app = await electron.launch({
    args: [repoRoot, `--user-data-dir=${join(real, 'user-data')}`, `--hackdesk-home=${home}`],
    cwd: repoRoot,
    env: { ...process.env, HOME: home },
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('treeitem', { name: /Linked note/ }).first()).toBeVisible({ timeout: 15_000 });
  } finally {
    app.process().kill('SIGKILL');
  }
});
