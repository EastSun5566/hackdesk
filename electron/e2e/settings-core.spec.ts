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

  // Settings save each change as it is made and stay open.
  let settings = await openSettings(page, 'Appearance');
  await settings.getByRole('radio', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);

  await settings.getByRole('tab', { name: 'Editor', exact: true }).click();
  await settings.getByRole('radio', { name: 'Vim', exact: true }).click();
  // Once the mode is saved, Settings is still on the page the change was made on.
  await expect.poll(async () => (await first.readSettings()).editor).toMatchObject({ mode: 'vim' });
  await expect(settings.getByRole('tab', { name: 'Editor', exact: true })).toHaveAttribute('aria-selected', 'true');

  await settings.getByRole('tab', { name: 'Shortcuts', exact: true }).click();
  await settings.getByRole('button', { name: 'Set shortcut for New Note', exact: true }).click();
  await page.keyboard.press(`${primary}+Alt+M`);
  await expect(settings.getByRole('button', { name: 'Set shortcut for New Note', exact: true })).toContainText(/Alt\+M|⌥⌘M/);

  // Saved through the real settings IPC, validation and atomic write.
  await expect.poll(() => first.readSettings()).toMatchObject({
    appearance: expect.objectContaining({ theme: 'dark' }),
    editor: expect.objectContaining({ mode: 'vim' }),
    shortcuts: expect.objectContaining({ 'new-note': 'mod+alt+m' }),
  });
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();

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
