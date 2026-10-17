import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createFakeCli } from '../src/main/ai/fake-cli-fixtures';
import { defaultSettings, type AiCustomCommand } from '../../src/lib/settings';
import { definedEnvironment } from './fixtures/environment';

const repoRoot = resolve(import.meta.dirname, '../..');
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

/** Opens HackDesk on a one-note vault with Claude on, backed by a fake `claude` that answers "Hello". */
async function launch(customCommands: AiCustomCommand[] = []) {
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
      customCommands,
    },
  }));
  const env = { ...definedEnvironment(process.env) };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--user-data-dir=${join(home, 'user-data')}`, `--hackdesk-home=${home}`], cwd: repoRoot, env });
  return { app, page: await app.firstWindow() };
}

async function selectDraftLine(page: Page) {
  await page.locator('.cm-line', { hasText: 'Helo wrold' }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
}

test('selected text is fixed inline with ⌘K, previewed, accepted and undone', async () => {
  const { app, page } = await launch();
  try {
    await selectDraftLine(page);
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

test('a saved command runs from the menu and adds its answer below', async () => {
  const { app, page } = await launch([
    { id: '0b6a8f4e-2d64-4f0e-9a6c-3f1f2a1c9d10', name: 'List the to-dos', prompt: 'List the to-dos as a checklist', delivery: 'insert-below' },
  ]);
  try {
    await selectDraftLine(page);
    await page.keyboard.press(`${mod}+k`);
    const menu = page.getByRole('dialog', { name: 'Ask AI' });
    await expect(menu.getByText('Your commands')).toBeVisible();
    await menu.getByText('List the to-dos').click();

    await expect(page.locator('.cm-ai-inserted-block')).toHaveText('Hello');
    await page.keyboard.press('Enter');
    // The original stays and the answer follows it as a new paragraph.
    await expect.poll(() => page.locator('.cm-content').innerText()).toMatch(/Helo wrold\n+Hello/);

    // Undo leaves the note unchanged, so closing does not stop on unsaved edits.
    await page.keyboard.press(`${mod}+z`);
    await expect(page.locator('.cm-content')).not.toContainText('Hello\n');
  } finally {
    await app.close();
  }
});

test('a typed request can be saved as a command from its preview', async () => {
  const { app, page } = await launch();
  try {
    await selectDraftLine(page);
    await page.keyboard.press(`${mod}+k`);
    await page.keyboard.type('make it formal');
    await page.getByRole('dialog', { name: 'Ask AI' }).getByText(/Ask AI: make it formal/).click();
    await expect(page.locator('.cm-ai-inserted')).toHaveText('Hello');

    await page.getByRole('button', { name: 'Save as command' }).click();
    await expect(page.getByLabel('Name')).toHaveValue('make it formal');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved "make it formal" to your AI commands.')).toBeVisible();

    // Discard the preview, then the saved command is offered on the next ⌘K.
    await page.locator('.cm-content').click();
    await page.keyboard.press('Escape');
    await selectDraftLine(page);
    await page.keyboard.press(`${mod}+k`);
    const menu = page.getByRole('dialog', { name: 'Ask AI' });
    await expect(menu.getByText('Your commands')).toBeVisible();
    await expect(menu.getByText('make it formal', { exact: true })).toBeVisible();
  } finally {
    await app.close();
  }
});
