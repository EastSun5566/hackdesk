import { expect, primary, test } from './fixtures/hackdesk';

const notes = [{ id: 'note-alpha', title: 'Alpha', content: '# Alpha\n\nAlpha body' }];

test('Escape in a dialog closes only the dialog, not a sidebar panel behind it', async ({ hackdesk }) => {
  const { page } = await hackdesk({ settings: { hackmdApiToken: 'fake-hackmd-token' }, fakeHackmd: true, hackmdNotes: notes });
  await expect(page.getByRole('treeitem', { name: /^Alpha\b/ })).toBeVisible();

  await page.getByTestId('sidebar-trash-row').getByRole('button', { name: 'My Trash' }).click();
  const backToNotes = page.getByRole('button', { name: 'Back to notes' });
  await expect(backToNotes).toBeVisible();

  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await page.keyboard.press(`${primary}+,`);
  await expect(settings).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await expect(backToNotes).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(backToNotes).toHaveCount(0);
});

test('closing the window takes down one layer at a time, in the workbench priority', async ({ hackdesk }) => {
  const { app, page } = await hackdesk({ settings: { hackmdApiToken: 'fake-hackmd-token' }, fakeHackmd: true, hackmdNotes: notes });
  await expect(page.getByRole('treeitem', { name: /^Alpha\b/ })).toBeVisible();

  await page.getByTestId('sidebar-trash-row').getByRole('button', { name: 'My Trash' }).click();
  const backToNotes = page.getByRole('button', { name: 'Back to notes' });
  await expect(backToNotes).toBeVisible();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await page.keyboard.press(`${primary}+,`);
  await expect(settings).toBeVisible();

  const requestClose = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  // Trash ranks above Settings, so it goes first although Settings opened last.
  await requestClose();
  await expect(backToNotes).toHaveCount(0);
  await expect(settings).toBeVisible();
  await requestClose();
  await expect(settings).toBeHidden();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});
