import type { Page } from '@playwright/test';

import { expect, test } from './fixtures/hackdesk';

const editor = (page: Page) => page.locator('[data-active-pane="true"] .cm-content');
const inSidebar = (page: Page) => page.evaluate(() => Boolean(document.activeElement?.closest('[data-hackdesk-focus="navigator"]')));

// Characterization for #385 A2: picking a note waits until its tab is the active one, then focuses
// that editor once. These pin the behaviour before the wait moves into the editor request queue.
test('picking a note in the sidebar focuses its editor, as the focus preference says', async ({ hackdesk }) => {
  const { page } = await hackdesk({ vault: { 'Note.md': '# Note\n\nBody\n', 'Plan.md': '# Plan\n\nSteps\n' } });

  await page.getByRole('treeitem', { name: /^Note/ }).click();
  await expect(editor(page)).toBeFocused();
  await expect(editor(page)).toContainText('Body');

  // Another pick moves focus to the new note's editor, not the one that had it.
  await page.getByRole('treeitem', { name: /^Plan/ }).click();
  await expect(editor(page)).toContainText('Steps');
  await expect(editor(page)).toBeFocused();

  // "Keep focus where it is": the note opens, the sidebar keeps the keyboard.
  await page.evaluate(() => window.localStorage.setItem('hackdesk_focus_editor_on_open', 'false'));
  await page.getByRole('treeitem', { name: /^Note/ }).click();
  await expect(editor(page)).toContainText('Body');
  await expect.poll(() => inSidebar(page)).toBe(true);
  // Nothing focuses the editor late.
  await page.waitForTimeout(500);
  expect(await inSidebar(page)).toBe(true);
});
