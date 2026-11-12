import type { Page } from '@playwright/test';

import { expect, primary, test } from './fixtures/hackdesk';

const notes = [
  { id: 'note-alpha', title: 'Alpha', content: '# Alpha\n\nAlpha body' },
  { id: 'note-beta', title: 'Beta', content: '# Beta\n\nBeta body' },
];

const tabState = (page: Page, title: string) => page.getByRole('tab', { name: new RegExp(`^${title}\\b`) }).locator('[data-sync-state]');

/** Opens a note in its own tab and replaces its body, leaving the edit unsaved. */
async function editInTab(page: Page, title: string, body: string) {
  await page.getByRole('treeitem', { name: new RegExp(`^${title}\\b`) }).dblclick();
  const editor = page.locator('[data-active-pane="true"] .cm-content');
  await expect(editor).toContainText(`${title} body`);
  await editor.fill(`# ${title}\n\n${body}`);
  await expect(tabState(page, title)).toHaveAttribute('data-sync-state', 'idle');
}

async function selectTab(page: Page, title: string) {
  await page.getByRole('tab', { name: new RegExp(`^${title}\\b`) }).click();
  await expect(page.locator('[data-active-pane="true"] .cm-content')).toContainText(title);
}

test('a failed save stays marked on its tab while another tab saves', async ({ hackdesk }) => {
  const { page, setHackmdFaults } = await hackdesk({ settings: { hackmdApiToken: 'fake-hackmd-token' }, fakeHackmd: true, hackmdNotes: notes });
  await expect(page.getByRole('treeitem', { name: /^Alpha\b/ })).toBeVisible();

  await editInTab(page, 'Alpha', 'Alpha edit');
  await editInTab(page, 'Beta', 'Beta edit');

  await setHackmdFaults({ failPatch: ['note-alpha'] });
  await selectTab(page, 'Alpha');
  await page.keyboard.press(`${primary}+s`);
  await expect(tabState(page, 'Alpha')).toHaveAttribute('data-sync-state', 'save_failed');

  // Saving another tab must not clear the first tab's failure.
  await selectTab(page, 'Beta');
  await page.keyboard.press(`${primary}+s`);
  await expect(tabState(page, 'Beta')).toHaveAttribute('data-sync-state', 'saved');
  await expect(tabState(page, 'Alpha')).toHaveAttribute('data-sync-state', 'save_failed');
});

test('a tab keeps showing its save in progress while another tab saves', async ({ hackdesk }) => {
  const { page, setHackmdFaults } = await hackdesk({ settings: { hackmdApiToken: 'fake-hackmd-token' }, fakeHackmd: true, hackmdNotes: notes });
  await expect(page.getByRole('treeitem', { name: /^Alpha\b/ })).toBeVisible();

  await editInTab(page, 'Alpha', 'Alpha edit');
  await editInTab(page, 'Beta', 'Beta edit');

  await setHackmdFaults({ delayPatchMs: { 'note-alpha': 4000 } });
  await selectTab(page, 'Alpha');
  await page.keyboard.press(`${primary}+s`);
  await expect(tabState(page, 'Alpha')).toHaveAttribute('data-sync-state', 'saving');

  await selectTab(page, 'Beta');
  await page.keyboard.press(`${primary}+s`);
  await expect(tabState(page, 'Beta')).toHaveAttribute('data-sync-state', 'saved');
  // Alpha's request is still waiting on HackMD.
  await expect(tabState(page, 'Alpha')).toHaveAttribute('data-sync-state', 'saving');
  await expect(tabState(page, 'Alpha')).toHaveAttribute('data-sync-state', 'saved', { timeout: 10_000 });
});

test('a failed save does not mark the note again after its tab is closed without saving', async ({ hackdesk }) => {
  const { page, setHackmdFaults } = await hackdesk({ settings: { hackmdApiToken: 'fake-hackmd-token' }, fakeHackmd: true, hackmdNotes: notes });
  await expect(page.getByRole('treeitem', { name: /^Alpha\b/ })).toBeVisible();

  await editInTab(page, 'Alpha', 'Alpha edit');
  await setHackmdFaults({ failPatch: ['note-alpha'] });
  await page.keyboard.press(`${primary}+s`);
  await expect(tabState(page, 'Alpha')).toHaveAttribute('data-sync-state', 'save_failed');

  // Close the tab and discard the edit, then open the note again.
  await page.getByRole('tab', { name: /^Alpha\b/ }).click();
  await page.keyboard.press(`${primary}+w`);
  await page.getByRole('alertdialog', { name: /Close/ }).getByRole('button', { name: 'Close Tab' }).click();
  await expect(page.getByRole('tab', { name: /^Alpha\b/ })).toHaveCount(0);
  await page.getByRole('treeitem', { name: /^Alpha\b/ }).dblclick();
  await expect(page.locator('[data-active-pane="true"] .cm-content')).toContainText('Alpha body');
  await expect(tabState(page, 'Alpha')).toHaveAttribute('data-sync-state', 'saved');
});

test('a save that fails after its tab closed does not mark the note when it opens again', async ({ hackdesk }) => {
  const { page, hackmdRequests, setHackmdFaults } = await hackdesk({ settings: { hackmdApiToken: 'fake-hackmd-token' }, fakeHackmd: true, hackmdNotes: notes });
  await expect(page.getByRole('treeitem', { name: /^Alpha\b/ })).toBeVisible();

  await editInTab(page, 'Alpha', 'Alpha edit');
  await setHackmdFaults({ failPatch: ['note-alpha'], delayPatchMs: { 'note-alpha': 3000 } });
  await page.keyboard.press(`${primary}+s`);
  await expect(tabState(page, 'Alpha')).toHaveAttribute('data-sync-state', 'saving');

  // Close the tab while the save is still waiting on HackMD, discarding the edit.
  await page.keyboard.press(`${primary}+w`);
  await page.getByRole('alertdialog', { name: /Close/ }).getByRole('button', { name: 'Close Tab' }).click();
  await expect(page.getByRole('tab', { name: /^Alpha\b/ })).toHaveCount(0);
  // Let the save fail.
  await expect.poll(async () => (await hackmdRequests()).some(request => request.method === 'PATCH')).toBe(true);
  await page.waitForTimeout(3500);

  await page.getByRole('treeitem', { name: /^Alpha\b/ }).dblclick();
  await expect(page.locator('[data-active-pane="true"] .cm-content')).toContainText('Alpha body');
  await expect(tabState(page, 'Alpha')).toHaveAttribute('data-sync-state', 'saved');
});
