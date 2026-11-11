import type { Page } from '@playwright/test';

import { expect, primary, test } from './fixtures/hackdesk';

const editor = (page: Page) => page.locator('[data-active-pane="true"] .cm-content');

async function openAndDismiss(page: Page, shortcut: string, name: string) {
  const dialog = page.getByRole('dialog', { name });
  // Right after launch the window can take the key before its shortcuts are listening.
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press(shortcut);
    await expect(dialog).toBeVisible({ timeout: 1000 });
  }).toPass();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

test('a dismissed dialog hands focus back to the open note, unless its command moved it', async ({ hackdesk }) => {
  const { page } = await hackdesk({ vault: { 'Note.md': '# Note\n\nBody\n', 'Projects/Plan.md': '# Plan\n' } });
  await page.getByRole('treeitem', { name: /^Note/ }).click();
  await editor(page).click();
  await expect(editor(page)).toBeFocused();

  await openAndDismiss(page, `${primary}+,`, 'Settings');
  await expect(editor(page)).toBeFocused();

  await openAndDismiss(page, `${primary}+K`, 'Command Palette');
  await expect(editor(page)).toBeFocused();

  // Opened from the sidebar, a dismissed dialog still returns to the note being written.
  await page.getByRole('treeitem', { name: /^Note/ }).focus();
  await openAndDismiss(page, `${primary}+,`, 'Settings');
  await expect(editor(page)).toBeFocused();

  // A command that moves focus keeps it where it put it.
  await page.keyboard.press(`${primary}+K`);
  const palette = page.getByRole('dialog', { name: 'Command Palette' });
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox').fill('Focus Sidebar');
  await palette.getByRole('option', { name: /^Focus Sidebar/ }).click();
  await expect(palette).toBeHidden();
  await expect.poll(() => page.evaluate(() => Boolean(document.activeElement?.closest('[data-hackdesk-focus="navigator"]')))).toBe(true);
  // It stays there once the dialog has finished closing.
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-hackdesk-focus="navigator"]')))).toBe(true);
});
