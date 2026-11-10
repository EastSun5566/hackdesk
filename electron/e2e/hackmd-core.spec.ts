import { expect, primary, runCommand, test } from './fixtures/hackdesk';

const token = 'fake-hackmd-token';

test('@core connects HackMD, stays connected after restart, and saves, creates and deletes through the API', async ({ hackdesk }) => {
  const first = await hackdesk({ settings: null, fakeHackmd: true });

  // Connect from a fresh install, through the real validation and encrypted settings write.
  await runCommand(first.page, 'Connect HackMD');
  const connect = first.page.getByRole('dialog', { name: 'Connect HackMD' });
  await connect.getByLabel('HackMD API Token', { exact: true }).fill(token);
  await connect.getByRole('button', { name: 'Connect', exact: true }).click();
  // Validating and storing the token are two main-process round trips.
  await expect(connect).toBeHidden({ timeout: 15_000 });

  // Each HackMD account keeps its own encrypted token; the plaintext token is never written.
  const stored = await first.readSettings();
  expect(stored.hackmdApiToken).toBe('');
  const accounts = stored.hackmdAccounts as { accounts: { id: string }[]; activeAccountId: string | null };
  const activeAccountId = accounts.activeAccountId ?? accounts.accounts[0]?.id;
  expect(activeAccountId).toEqual(expect.any(String));
  const encryptedTokens = stored.hackmdAccountTokensEncrypted as Record<string, unknown>;
  expect(encryptedTokens[activeAccountId!]).toMatchObject({ version: 1, ciphertext: expect.any(String) });
  expect(JSON.stringify(stored)).not.toContain(token);

  // The token is read back from encrypted storage after a restart.
  const { page, hackmdRequests } = await first.restart();
  const alpha = page.getByRole('treeitem', { name: /^Alpha/ });
  await expect(alpha).toBeVisible();
  const requests = await hackmdRequests();
  expect(requests.filter(request => request.path === '/v1/me').at(-1)?.authorization).toBe(`Bearer ${token}`);

  // Save sends only the edit, after checking HackMD with the note's ETag.
  await alpha.click();
  const editor = page.locator('.cm-content');
  await expect(editor).toContainText('Alpha body');
  await editor.fill('# Alpha\n\nEdited on the desktop');
  await page.keyboard.press(`${primary}+s`);
  await expect.poll(async () => (await hackmdRequests()).some(request => request.method === 'PATCH')).toBe(true);
  const afterSave = await hackmdRequests();
  const patch = afterSave.find(request => request.method === 'PATCH')!;
  expect(patch).toMatchObject({
    path: '/v1/notes/note-alpha',
    authorization: `Bearer ${token}`,
    body: expect.objectContaining({ content: '# Alpha\n\nEdited on the desktop' }),
  });
  const check = afterSave.slice(0, afterSave.indexOf(patch)).filter(request => request.path === '/v1/notes/note-alpha').at(-1);
  expect(check?.ifNoneMatch).toBe('W/"note-alpha-1"');
  await expect(page.getByRole('tab', { name: /^Alpha$/ })).toBeVisible();

  // A new note is created in HackMD when its draft is saved.
  await runCommand(page, 'New Note');
  await expect(page.getByRole('tab', { name: 'Untitled, Unsaved', selected: true })).toBeVisible();
  await editor.fill('# Beta\n\nCreated on the desktop');
  await page.keyboard.press(`${primary}+s`);
  // The saved note replaces the draft tab; wait for that before acting on it.
  await expect(page.getByRole('tab', { name: 'Beta', exact: true, selected: true })).toBeVisible();
  const beta = page.getByRole('treeitem', { name: /^Beta/ });
  await expect(beta).toBeVisible();
  expect((await hackmdRequests()).find(request => request.method === 'POST' && request.path === '/v1/notes')?.body)
    .toMatchObject({ content: '# Beta\n\nCreated on the desktop' });

  // Deleting moves it to the HackMD trash, and Undo restores it.
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: /Delete/ }).click();
  await page.getByRole('alertdialog', { name: 'Delete Note' }).getByRole('button', { name: 'Delete' }).click();
  await expect(beta).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(beta).toBeVisible();
  const writes = (await hackmdRequests()).filter(request => request.method !== 'GET').map(({ method, path }) => `${method} ${path}`);
  expect(writes).toEqual([
    'PATCH /v1/notes/note-alpha',
    'POST /v1/notes',
    'DELETE /v1/notes/note-1',
    'PUT /v1/trash/note-1/restore',
  ]);
});
