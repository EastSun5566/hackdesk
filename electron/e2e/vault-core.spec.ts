import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { expect, primary, runCommand, test } from './fixtures/hackdesk';

/** Markdown files under the vault, as sorted vault-relative paths, ignoring HackDesk's own data. */
async function markdownFiles(vault: string): Promise<string[]> {
  const entries = await readdir(vault, { recursive: true, withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => relative(vault, join(entry.parentPath, entry.name)).split('\\').join('/'))
    .filter(path => !path.startsWith('.hackdesk/'))
    .sort();
}

const isDirectory = (path: string) => stat(path).then(info => info.isDirectory(), () => false);

test('@core Local Vault notes and folders are created, renamed, moved and trashed on disk', async ({ hackdesk }) => {
  const { page, vault, home } = await hackdesk({ vault: { 'Inbox.md': '# Inbox\n\nFirst note\n' } });
  const tree = page.getByRole('tree', { name: 'Folders and notes' });
  const editor = page.locator('.cm-content');
  await expect(tree.getByRole('treeitem', { name: /^Inbox/ })).toBeVisible();

  // A new note is written to disk when its draft is saved.
  await runCommand(page, 'New Note');
  await expect(page.getByRole('tab', { name: 'Untitled, Unsaved', selected: true })).toBeVisible();
  await editor.fill('# Plan\n\nWritten in HackDesk');
  await page.keyboard.press(`${primary}+s`);
  // The saved note replaces the draft tab; wait for that before the next command.
  await expect(page.getByRole('tab', { name: 'Plan', exact: true, selected: true })).toBeVisible();
  // Saving keeps the editor focused, so note commands apply to the saved note right away.
  await expect(editor).toBeFocused();
  await expect(tree.getByRole('treeitem', { name: /^Plan/ })).toBeVisible();
  await expect.poll(() => markdownFiles(vault)).toEqual(['Inbox.md', 'Plan.md']);
  expect(await readFile(join(vault, 'Plan.md'), 'utf8')).toContain('Written in HackDesk');

  // Renaming the note renames its file.
  await runCommand(page, 'Rename Note');
  const rename = page.getByRole('dialog', { name: 'Rename Note' });
  await rename.getByLabel('Title').fill('Roadmap');
  await rename.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Roadmap', exact: true, selected: true })).toBeVisible();
  await expect.poll(() => markdownFiles(vault)).toEqual(['Inbox.md', 'Roadmap.md']);

  // A new folder is created on disk, and the note moves into it.
  await page.getByRole('complementary', { name: 'Sidebar' }).getByRole('button', { name: 'New Folder', exact: true }).click();
  const folderDialog = page.getByRole('dialog', { name: 'New Folder' });
  await folderDialog.getByLabel('Name', { exact: true }).fill('Projects');
  await folderDialog.getByLabel('Name', { exact: true }).press('Enter');
  await expect(folderDialog).toBeHidden();
  await expect.poll(() => isDirectory(join(vault, 'Projects'))).toBe(true);

  await tree.getByRole('treeitem', { name: /^Roadmap/ }).click();
  await runCommand(page, 'Move Note to Folder');
  const picker = page.getByRole('dialog', { name: 'Move Note to Folder' });
  await picker.getByRole('option', { name: /^Projects/ }).click();
  await expect.poll(() => markdownFiles(vault)).toEqual(['Inbox.md', 'Projects/Roadmap.md']);

  // A file added outside HackDesk shows up without a restart.
  await writeFile(join(vault, 'Projects', 'External.md'), '# External\n\nAdded by another app\n');
  await expect(tree.getByRole('treeitem', { name: /^External/ })).toBeVisible();

  // Trashing a note removes only that file; trashing a folder removes the folder and its notes.
  await tree.getByRole('treeitem', { name: /^Inbox/ }).click();
  await expect(editor).toContainText('First note');
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: /Trash|Delete/ }).click();
  await page.getByRole('alertdialog', { name: 'Move Note to Trash' }).getByRole('button', { name: 'Move to Trash' }).click();
  await expect(tree.getByRole('treeitem', { name: /^Inbox/ })).toHaveCount(0);
  await expect.poll(() => markdownFiles(vault)).toEqual(['Projects/External.md', 'Projects/Roadmap.md']);

  await tree.getByRole('treeitem', { name: /^Projects/ }).click();
  await runCommand(page, 'Delete Folder');
  await page.getByRole('alertdialog', { name: 'Move Folder to Trash' }).getByRole('button', { name: 'Move to Trash' }).click();
  await expect(tree.getByRole('treeitem', { name: /^Projects/ })).toHaveCount(0);
  await expect.poll(() => isDirectory(join(vault, 'Projects'))).toBe(false);
  expect(await markdownFiles(vault)).toEqual([]);
  if (process.platform === 'linux') {
    // Trashed, not deleted: the fixture points the OS trash at the test home.
    expect((await readdir(join(home, 'xdg-data', 'Trash', 'files'))).sort()).toEqual(['Inbox.md', 'Projects']);
  }
});
