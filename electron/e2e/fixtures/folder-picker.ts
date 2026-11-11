import { expect, type ElectronApplication, type Page } from '@playwright/test';

/** Cancels the in-app folder picker opened by vault choosing. */
export async function cancelFolderPicker(page: Page) {
  const picker = page.getByRole('dialog', { name: 'Choose a Vault Folder' });
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(picker).not.toBeVisible();
}

/**
 * Picks a folder in the in-app folder picker. The picker starts at the current
 * vault (or the home folder), so climb to the shared parent first when the target
 * lives next to it, then descend into it and confirm.
 */
export async function chooseFolderInPicker(_app: ElectronApplication, page: Page, targetBaseName: string, climbTo?: string) {
  const picker = page.getByRole('dialog', { name: 'Choose a Vault Folder' });
  if (climbTo) {
    await picker.getByRole('button', { name: climbTo, exact: true }).click();
  }
  await picker.getByRole('option', { name: targetBaseName, exact: true }).click();
  await picker.getByRole('button', { name: `Choose “${targetBaseName}”`, exact: true }).click();
  await expect(picker).not.toBeVisible();
  // The app then asks, in its own dialog, whether to use the folder.
  const confirm = page.getByRole('alertdialog', { name: `Use “${targetBaseName}” as a vault folder?` });
  await confirm.getByRole('button', { name: 'Use Folder', exact: true }).click();
  await expect(confirm).not.toBeVisible();
}
