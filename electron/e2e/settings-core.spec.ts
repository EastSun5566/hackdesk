import type { Page } from '@playwright/test';

import { expect, primary, test } from './fixtures/hackdesk';

async function openSettings(page: Page, section: string) {
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  // Right after launch the window can take the key before its shortcuts are listening.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press(`${primary}+,`);
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await dialog.getByRole('tab', { name: section, exact: true }).click();
  return dialog;
}

test('@core theme, editor mode and a shortcut changed in Settings are saved and applied after restart', async ({ hackdesk }) => {
  const first = await hackdesk({ vault: { 'Note.md': '# Note\n\nSettings fixture\n' } });
  let { page } = first;
  await expect(page.getByRole('treeitem', { name: /^Note/ })).toBeVisible();

  let settings = await openSettings(page, 'Appearance');
  await settings.getByRole('radio', { name: 'Dark', exact: true }).click();
  // Apply Theme and Save each close Settings.
  await settings.getByRole('button', { name: 'Apply Theme' }).click();
  await expect(settings).toBeHidden();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  settings = await openSettings(page, 'Editor');
  await settings.getByRole('radio', { name: 'Vim', exact: true }).click();
  await settings.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(settings).toBeHidden();

  settings = await openSettings(page, 'Shortcuts');
  await settings.getByRole('button', { name: 'Set shortcut for New Note', exact: true }).click();
  await page.keyboard.press(`${primary}+Alt+M`);
  await expect(settings.getByRole('button', { name: 'Set shortcut for New Note', exact: true })).toContainText(/Alt\+M|⌥⌘M/);
  await settings.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(settings).toBeHidden();

  // Saved through the real settings IPC, validation and atomic write.
  expect(await first.readSettings()).toMatchObject({
    appearance: expect.objectContaining({ theme: 'dark' }),
    editor: expect.objectContaining({ mode: 'vim' }),
    shortcuts: expect.objectContaining({ 'new-note': 'mod+alt+m' }),
  });

  ({ page } = await first.restart());
  await expect(page.getByRole('treeitem', { name: /^Note/ })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  // The Vim extension marks the editor's scroller and draws a block cursor.
  await expect(page.locator('.cm-editor .cm-vimMode').first()).toBeVisible();

  const tabs = page.getByRole('tab', { name: /, Unsaved$/ });
  const before = await tabs.count();
  await page.getByRole('treeitem', { name: /^Note/ }).focus();
  await page.keyboard.press(`${primary}+Alt+M`);
  await expect(tabs).toHaveCount(before + 1);

  settings = await openSettings(page, 'Editor');
  await expect(settings.getByRole('radio', { name: 'Vim', exact: true })).toBeChecked();
});
