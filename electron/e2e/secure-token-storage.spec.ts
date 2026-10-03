import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultSettings } from '../../src/lib/settings';

const repoRoot = resolve(import.meta.dirname, '../..');
const token = 'smoke-token-not-a-real-hackmd-token';

async function launch(home: string) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.HACKDESK_ELECTRON_DEV_SERVER_URL;
  const app = await electron.launch({ args: [repoRoot, `--hackdesk-home=${home}`, `--user-data-dir=${join(home, 'user-data')}`], cwd: repoRoot, env });
  return { app, page: await app.firstWindow() };
}

test('migrates a legacy credential with the OS provider, or preserves it and rejects an insecure fallback', async () => {
  const home = await mkdtemp(join(tmpdir(), 'hackdesk-secure-token-'));
  const vault = join(home, 'vault');
  await mkdir(vault);
  await mkdir(join(home, '.hackdesk'));
  await writeFile(join(vault, 'Local.md'), 'Local notes still work');
  const path = join(home, '.hackdesk', 'settings.json');
  const original = JSON.stringify({ ...defaultSettings, hackmdApiToken: token, localVault: { path: vault } });
  await writeFile(path, original);
  let { app, page } = await launch(home);
  try {
    await expect(page.locator('.cm-content')).toContainText('Local notes still work');
    const secure = await app.evaluate(({ safeStorage }) => safeStorage.isEncryptionAvailable()
      && (process.platform !== 'linux' || !['basic_text', 'unknown'].includes(safeStorage.getSelectedStorageBackend())));
    const settings = await page.evaluate(() => window.hackdeskAPI!.settings.get());
    expect(JSON.stringify(settings)).not.toContain(token);
    if (secure) {
      const stored = JSON.parse(await readFile(path, 'utf8'));
      expect(stored.hackmdApiToken).toBe('');
      expect(JSON.stringify(stored)).not.toContain(token);
      expect(await app.evaluate(({ safeStorage }, envelope) => safeStorage.decryptString(Buffer.from(envelope.ciphertext, 'base64')), stored.hackmdApiTokenEncrypted)).toBe(token);
      await app.close();
      ({ app, page } = await launch(home));
      await expect(page.locator('.cm-content')).toContainText('Local notes still work');
      const restored = await page.evaluate(() => window.hackdeskAPI!.settings.get());
      expect(restored).toMatchObject({ hasHackmdApiToken: true, hackmdTokenStorageError: null });
      // A damaged credential must not stop startup or disappear on unrelated settings writes.
      await app.close();
      stored.hackmdApiTokenEncrypted.ciphertext = 'AA==';
      await writeFile(path, JSON.stringify(stored));
      ({ app, page } = await launch(home));
      await expect(page.locator('.cm-content')).toContainText('Local notes still work');
      expect(await page.evaluate(() => window.hackdeskAPI!.settings.get())).toMatchObject({
        hasHackmdApiToken: true, hackmdTokenStorageError: expect.stringContaining('Could not unlock'),
      });
      await page.evaluate(() => window.hackdeskAPI!.settings.update({ title: 'Still local' }));
      expect(JSON.parse(await readFile(path, 'utf8')).hackmdApiTokenEncrypted).toEqual(stored.hackmdApiTokenEncrypted);
    } else {
      expect(settings.hackmdTokenStorageError).toContain('could not be protected');
      expect(await readFile(path, 'utf8')).toBe(original);
      const error = await page.evaluate(async (value) => {
        try { await window.hackdeskAPI!.settings.update({ hackmdApiToken: value }); return null; }
        catch (error) { return String(error); }
      }, token);
      expect(error).toContain('unavailable');
      expect(await readFile(path, 'utf8')).toBe(original);
      await page.evaluate(() => window.hackdeskAPI!.settings.update({ title: 'Still local' }));
      expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ title: 'Still local', hackmdApiToken: token });
    }
    await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+,`);
    await page.getByRole('tab', { name: /HackMD/ }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('credential-storage-error.png') });
    await page.evaluate(() => window.hackdeskAPI!.settings.update({ hackmdApiToken: '' }));
    expect(JSON.parse(await readFile(path, 'utf8'))).not.toHaveProperty('hackmdApiTokenEncrypted');
  } finally {
    await app.close();
    await rm(home, { recursive: true, force: true });
  }
});
