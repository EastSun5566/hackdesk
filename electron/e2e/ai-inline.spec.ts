import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createFakeCli } from '../src/main/ai/fake-cli-fixtures';
import { defaultSettings } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test('selected text is fixed inline with ⌘K, previewed, accepted and undone', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-ai-inline-'));
  const vault = join(home, 'vault');
  await mkdir(join(home, '.hackdesk'), { recursive: true });
  await mkdir(vault);
  await writeFile(join(vault, 'Draft.md'), '# Draft\n\nHelo wrold\n');
  // A configured command path keeps the real `claude` on the login shell's PATH out of the test.
  const fake = await createFakeCli('claude');
  await writeFile(join(home, '.hackdesk', 'settings.json'), JSON.stringify({
    ...defaultSettings,
    localVault: { path: vault },
    onboarding: { hackmdTokenSetupDeferred: true },
    ai: {
      ...defaultSettings.ai,
      providers: { ...defaultSettings.ai.providers, claude: { enabled: true, model: null, commandPath: fake.executable } },
      defaultProvider: 'claude',
    },
  }));
  const env = { ...definedEnvironment(process.env) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  try {
    const page = await app.firstWindow();
    const line = page.locator('.cm-line', { hasText: 'Helo wrold' });
    await line.click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');

    await page.keyboard.press(`${mod}+k`);
    const menu = page.getByRole('dialog', { name: 'Ask AI' });
    await expect(menu).toBeVisible();
    await menu.getByText('Fix spelling & grammar').click();

    // The fake answers "Hello"; the note keeps its text until the answer is accepted.
    await expect(page.locator('.cm-ai-inserted')).toHaveText('Hello');
    await expect(page.locator('.cm-content')).toContainText('Helo wrold');
    await page.keyboard.press('Enter');
    await expect(page.locator('.cm-line', { hasText: 'Hello' })).toHaveText('Hello');

    await page.keyboard.press(`${mod}+z`);
    await expect(page.locator('.cm-content')).toContainText('Helo wrold');

    // Without a selection ⌘K is still the command palette.
    await page.keyboard.press('End');
    await page.keyboard.press(`${mod}+k`);
    await expect(page.getByRole('combobox', { name: /Search notes, folders, and commands/ })).toBeVisible();
  } finally {
    await app.close();
  }
});
