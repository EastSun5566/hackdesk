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
export async function chooseFolderInPicker(app: ElectronApplication, page: Page, targetBaseName: string, climbTo?: string) {
  const picker = page.getByRole('dialog', { name: 'Choose a Vault Folder' });
  if (climbTo) {
    await picker.getByRole('button', { name: climbTo, exact: true }).click();
  }
  await picker.getByRole('option', { name: targetBaseName, exact: true }).click();
  // The main process confirms the folder in a native dialog; answer that one question, once.
  await app.evaluate(({ dialog }) => {
    const original = dialog.showMessageBox;
    const answer = (async (...args: unknown[]) => {
      const options = args.at(-1) as { message?: string } | undefined;
      if (!options?.message?.startsWith('Use “')) return Reflect.apply(original, dialog, args);
      dialog.showMessageBox = original;
      (globalThis as { confirmedVaultFolder?: string }).confirmedVaultFolder = options.message;
      return { response: 0, checkboxChecked: false };
    }) as typeof original;
    dialog.showMessageBox = answer;
  });
  await picker.getByRole('button', { name: `Choose “${targetBaseName}”`, exact: true }).click();
  await expect(picker).not.toBeVisible();
  await expect.poll(() => app.evaluate(() => (globalThis as { confirmedVaultFolder?: string }).confirmedVaultFolder))
    .toBe(`Use “${targetBaseName}” as a vault folder?`);
}
