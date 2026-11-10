import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  homePath: '',
  available: true,
  backend: 'gnome_libsecret',
  encrypt: vi.fn<(token: string) => Buffer>(),
  decrypt: vi.fn<(buffer: Buffer) => string>(),
}));
const fsMock = vi.hoisted(() => ({ failRename: false, failOpen: false, failRenameAfter: Infinity }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  const rename = async (...args: Parameters<typeof fs.rename>) => {
    if (fsMock.failRename || fsMock.failRenameAfter-- <= 0) throw new Error('Test disk failure');
    return fs.rename(...args);
  };
  const open = async (...args: Parameters<typeof fs.open>) => {
    if (fsMock.failOpen) throw new Error('ENOSPC: no space left on device');
    return fs.open(...args);
  };
  return { ...fs, rename, open, default: { ...fs, rename, open } };
});

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.homePath),
  },
  safeStorage: {
    isEncryptionAvailable: () => electronMock.available,
    getSelectedStorageBackend: () => electronMock.backend,
    encryptString: electronMock.encrypt,
    decryptString: electronMock.decrypt,
  },
}));

import { defaultSettings } from '../../../src/lib/settings';
import { getHackmdCliConfigPath, getSettingsPath } from './paths';
import {
  getHackmdCliConfigStatus,
  getSafeSettings,
  inspectSettingsFile,
  readStoredSettings,
  resetDamagedSettingsFile,
  readHackmdApiToken,
  readHackmdCliAccessToken,
  updateStoredSettings,
} from './settings';

describe('Electron settings', () => {
  beforeEach(async () => {
    fsMock.failRename = false;
    fsMock.failOpen = false;
    fsMock.failRenameAfter = Infinity;
    electronMock.available = true;
    electronMock.backend = 'gnome_libsecret';
    electronMock.encrypt.mockReset().mockImplementation((token) => {
      const cipher = createCipheriv('aes-256-gcm', Buffer.alloc(32, 7), Buffer.alloc(12, 3));
      const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
      return Buffer.concat([cipher.getAuthTag(), encrypted]);
    });
    electronMock.decrypt.mockReset().mockImplementation((buffer) => {
      const cipher = createDecipheriv('aes-256-gcm', Buffer.alloc(32, 7), Buffer.alloc(12, 3));
      cipher.setAuthTag(buffer.subarray(0, 16));
      return Buffer.concat([cipher.update(buffer.subarray(16)), cipher.final()]).toString('utf8');
    });
    electronMock.homePath = await mkdtemp(join(tmpdir(), 'hackdesk-settings-'));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(electronMock.homePath, { force: true, recursive: true });
  });

  it('persists keyboard navigation through the existing settings update', async () => {
    const keyboardNavigation = { characterShortcutsEnabled: false, keyHintsVisible: false };
    const saved = await updateStoredSettings({ keyboardNavigation });
    expect(saved.keyboardNavigation).toEqual(keyboardNavigation);
    expect((await getSafeSettings()).keyboardNavigation).toEqual(keyboardNavigation);
    expect(JSON.parse(await readFile(getSettingsPath(), 'utf8')).keyboardNavigation).toEqual(keyboardNavigation);
  });

  it('defaults onboarding state for old settings files without exposing the token', async () => {
    await mkdir(join(electronMock.homePath, '.hackdesk'), { recursive: true });
    await writeFile(getSettingsPath(), JSON.stringify({
      title: 'Workspace',
      hackmdApiToken: 'secret-token',
    }));

    const safeSettings = await getSafeSettings();

    expect(safeSettings).toMatchObject({
      title: 'Workspace',
      editor: { mode: 'standard' },
      hasHackmdApiToken: true,
      hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
      onboarding: { hackmdTokenSetupDeferred: false },
      workspaceNavigation: { pinnedTeamIds: null },
      shouldShowHackmdOnboarding: false,
    });
    expect('hackmdApiToken' in safeSettings).toBe(false);
    expect(safeSettings.hackmdTokenStorageError).toBeNull();
    expect(await readHackmdApiToken()).toBe('secret-token');
    expect(await readFile(getSettingsPath(), 'utf8')).not.toContain('secret-token');
  });

  it('stores only ciphertext with private permissions and restores it without an in-memory token cache', async () => {
    await updateStoredSettings({ hackmdApiToken: 'private-secret', title: 'Workspace', hackmdAccountLabel: '@ada' });
    const stored = JSON.parse(await readFile(getSettingsPath(), 'utf8'));
    expect(stored.hackmdApiToken).toBe('');
    expect(stored).not.toHaveProperty('hackmdApiTokenEncrypted');
    expect(Object.values(stored.hackmdAccountTokensEncrypted)).toEqual([{ version: 1, ciphertext: expect.any(String) }]);
    expect(JSON.stringify(stored)).not.toContain('private-secret');
    expect(JSON.stringify(stored)).toContain('@ada');
    expect(await readHackmdApiToken()).toBe('private-secret');
    expect(await readStoredSettings()).toMatchObject({ title: 'Workspace', hackmdApiToken: '' });
    expect(await getSafeSettings()).toMatchObject({
      hasHackmdApiToken: true,
      hackmdAccounts: { accounts: [{ label: '@ada', hasToken: true }], activeAccountId: expect.any(String) },
    });
    expect(await readdir(join(electronMock.homePath, '.hackdesk'))).toEqual(['settings.json']);
    if (process.platform !== 'win32') expect((await stat(getSettingsPath())).mode & 0o777).toBe(0o600);
  });

  it('serializes legacy migration with settings updates and preserves unrelated fields', async () => {
    await mkdir(join(electronMock.homePath, '.hackdesk'), { recursive: true });
    await writeFile(getSettingsPath(), JSON.stringify({ title: 'Old', hackmdApiToken: 'legacy-secret' }));
    await Promise.all([getSafeSettings(), updateStoredSettings({ title: 'New', localVaultPath: '/tmp/vault' })]);
    expect(await readStoredSettings()).toMatchObject({ title: 'New', localVault: { vaults: [{ id: expect.any(String), path: '/tmp/vault' }], activeVaultId: expect.any(String) } });
    expect(await readHackmdApiToken()).toBe('legacy-secret');
    expect(await readFile(getSettingsPath(), 'utf8')).not.toContain('legacy-secret');
    expect(electronMock.encrypt).toHaveBeenCalledOnce();
  });

  it('keeps the legacy file on migration write failure, reports it and retries later', async () => {
    await mkdir(join(electronMock.homePath, '.hackdesk'), { recursive: true });
    const original = JSON.stringify({ title: 'Workspace', hackmdApiToken: 'legacy-secret', localVault: { path: '/tmp/vault' } });
    await writeFile(getSettingsPath(), original);
    fsMock.failRename = true;
    expect(await getSafeSettings()).toMatchObject({ hasHackmdApiToken: true, hackmdTokenStorageError: expect.stringContaining('could not be protected') });
    expect(await readStoredSettings()).toMatchObject({ title: 'Workspace', localVault: { vaults: [{ id: expect.any(String), path: '/tmp/vault' }], activeVaultId: expect.any(String) } });
    expect(await readFile(getSettingsPath(), 'utf8')).toBe(original);
    expect(await readdir(join(electronMock.homePath, '.hackdesk'))).toEqual(['settings.json']);
    fsMock.failRename = false;
    expect((await getSafeSettings()).hackmdTokenStorageError).toBeNull();
    expect(await readHackmdApiToken()).toBe('legacy-secret');
  });

  it('keeps local settings editable during a blocked legacy migration and retries protection later', async () => {
    await mkdir(join(electronMock.homePath, '.hackdesk'), { recursive: true });
    await writeFile(getSettingsPath(), JSON.stringify({ hackmdApiToken: 'legacy-secret' }));
    electronMock.available = false;
    expect(await updateStoredSettings({ title: 'Still local', localVaultPath: '/tmp/vault' })).toMatchObject({
      title: 'Still local', localVault: { vaults: [{ id: expect.any(String), path: '/tmp/vault' }], activeVaultId: expect.any(String) },
      hackmdTokenStorageError: expect.stringContaining('could not be protected'),
    });
    expect(JSON.parse(await readFile(getSettingsPath(), 'utf8')).hackmdApiToken).toBe('legacy-secret');
    await expect(readHackmdApiToken()).rejects.toThrow('could not be protected');
    await expect(updateStoredSettings({ hackmdApiToken: 'new-secret' })).rejects.toThrow('unavailable');
    await updateStoredSettings({ localVaultPath: null });
    electronMock.available = true;
    expect(await readHackmdApiToken()).toBe('legacy-secret');
    expect(await readStoredSettings()).toMatchObject({ title: 'Still local', localVault: { vaults: [], activeVaultId: null } });
    expect(await readFile(getSettingsPath(), 'utf8')).not.toContain('legacy-secret');
  });

  it('preserves encrypted tokens and local settings when the keyring is unavailable, but allows explicit clearing', async () => {
    await updateStoredSettings({ hackmdApiToken: 'saved-secret', localVaultPath: '/tmp/vault' });
    const blobs = JSON.parse(await readFile(getSettingsPath(), 'utf8')).hackmdAccountTokensEncrypted;
    electronMock.available = false;
    expect(await readStoredSettings()).toMatchObject({ localVault: { vaults: [{ id: expect.any(String), path: '/tmp/vault' }], activeVaultId: expect.any(String) } });
    expect(await getSafeSettings()).toMatchObject({ hasHackmdApiToken: true, hackmdTokenStorageError: expect.stringContaining('unavailable') });
    await expect(readHackmdApiToken()).rejects.toThrow('unavailable');
    await updateStoredSettings({ title: 'Still local' });
    await expect(updateStoredSettings({ hackmdApiToken: 'new-secret' })).rejects.toThrow('unavailable');
    expect(JSON.parse(await readFile(getSettingsPath(), 'utf8'))).toMatchObject({ title: 'Still local', hackmdAccountTokensEncrypted: blobs });
    await updateStoredSettings({ hackmdApiToken: '' });
    expect((await getSafeSettings()).hasHackmdApiToken).toBe(false);
    expect((await getSafeSettings()).hackmdAccounts).toEqual({ accounts: [], activeAccountId: null });
    expect(JSON.parse(await readFile(getSettingsPath(), 'utf8')).hackmdAccountTokensEncrypted ?? {}).toEqual({});
  });

  it.each(['basic_text', 'unknown'])('refuses Linux %s storage without storing a new plaintext token', async (backend) => {
    vi.stubGlobal('process', { ...process, platform: 'linux' });
    electronMock.backend = backend;
    await expect(updateStoredSettings({ hackmdApiToken: 'new-secret' })).rejects.toThrow('unavailable');
    expect(electronMock.encrypt).not.toHaveBeenCalled();
    await expect(readFile(getSettingsPath())).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readStoredSettings()).toMatchObject({ title: 'HackDesk' });
  });

  it.each([null, { version: 2, ciphertext: 'AA==' }, { version: 1, ciphertext: 'invalid!' }, { version: 1, ciphertext: 'AA==' }])(
    'preserves invalid ciphertext without falling back to a second plaintext credential: %j', async (encrypted) => {
      await mkdir(join(electronMock.homePath, '.hackdesk'), { recursive: true });
      await writeFile(getSettingsPath(), JSON.stringify({ title: 'Workspace', hackmdApiToken: 'must-not-fallback', hackmdApiTokenEncrypted: encrypted }));
      await expect(readHackmdApiToken()).rejects.toThrow('Could not unlock');
      expect(await getSafeSettings()).toMatchObject({ hasHackmdApiToken: true, hackmdTokenStorageError: expect.stringContaining('Could not unlock') });
      await updateStoredSettings({ title: 'Updated' });
      // The legacy blob migrates into the account list untouched.
      expect(Object.values(JSON.parse(await readFile(getSettingsPath(), 'utf8')).hackmdAccountTokensEncrypted)).toEqual([encrypted]);
      await updateStoredSettings({ hackmdApiToken: 'replacement' });
      expect(await readHackmdApiToken()).toBe('replacement');
    },
  );

  it('migrates a legacy encrypted token file into an unnamed account', async () => {
    const { encryptHackmdToken } = await import('./token-storage');
    await mkdir(join(electronMock.homePath, '.hackdesk'), { recursive: true });
    await writeFile(getSettingsPath(), JSON.stringify({ title: 'Workspace', hackmdApiTokenEncrypted: encryptHackmdToken('migrated-secret') }));
    const settings = await getSafeSettings();
    expect(settings.hasHackmdApiToken).toBe(true);
    expect(settings.hackmdTokenStorageError).toBeNull();
    expect(settings.hackmdAccounts.accounts).toHaveLength(1);
    expect(settings.hackmdAccounts.accounts[0]).toMatchObject({ label: '', hasToken: true });
    expect(settings.hackmdAccounts.activeAccountId).toBe(settings.hackmdAccounts.accounts[0].id);
    expect(await readHackmdApiToken()).toBe('migrated-secret');
    // The legacy key is gone after the next write.
    await updateStoredSettings({ title: 'Renamed' });
    const stored = JSON.parse(await readFile(getSettingsPath(), 'utf8'));
    expect(stored).not.toHaveProperty('hackmdApiTokenEncrypted');
    expect(Object.keys(stored.hackmdAccountTokensEncrypted)).toHaveLength(1);
  });

  it('upserts the active token, adds a second account on request, and switches and forgets', async () => {
    const first = await updateStoredSettings({ hackmdApiToken: 'token-a', hackmdAccountLabel: '@ada' });
    const accountA = first.hackmdAccounts.accounts[0].id;
    expect(first.hackmdAccounts).toMatchObject({ accounts: [{ id: accountA, label: '@ada', hasToken: true }], activeAccountId: accountA });
    expect(await readHackmdApiToken()).toBe('token-a');

    // Replacing the active token keeps the one account.
    const replaced = await updateStoredSettings({ hackmdApiToken: 'token-a2', hackmdAccountLabel: '@ada-new' });
    expect(replaced.hackmdAccounts).toMatchObject({ accounts: [{ id: accountA, label: '@ada-new', hasToken: true }], activeAccountId: accountA });
    expect(await readHackmdApiToken()).toBe('token-a2');

    // Connecting another account adds and activates it without touching the first token.
    const second = await updateStoredSettings({ hackmdApiToken: 'token-b', hackmdAccountLabel: '@grace', hackmdAddAccount: true });
    const accountB = second.hackmdAccounts.activeAccountId;
    if (accountB === null || accountB === accountA) {
      throw new Error('expected a second active account');
    }
    expect(accountB).not.toBe(accountA);
    expect(second.hackmdAccounts.accounts).toHaveLength(2);
    expect(await readHackmdApiToken()).toBe('token-b');

    // Re-saving the active token refreshes its label instead of duplicating the account.
    const same = await updateStoredSettings({ hackmdApiToken: 'token-b', hackmdAccountLabel: '@grace-hopper', hackmdAddAccount: true });
    expect(same.hackmdAccounts.accounts).toHaveLength(2);
    expect(same.hackmdAccounts.activeAccountId).toBe(accountB);

    // Switching reads the other account's token.
    const switched = await updateStoredSettings({ hackmdActiveAccountId: accountA });
    expect(switched.hackmdAccounts.activeAccountId).toBe(accountA);
    expect(await readHackmdApiToken()).toBe('token-a2');

    // Switching to an unknown account keeps the current one.
    expect((await updateStoredSettings({ hackmdActiveAccountId: 'missing' })).hackmdAccounts.activeAccountId).toBe(accountA);

    // Forgetting the active account falls back to the next one and drops its token.
    const forgotten = await updateStoredSettings({ hackmdRemoveAccountId: accountA });
    expect(forgotten.hackmdAccounts).toMatchObject({ accounts: [{ id: accountB, hasToken: true }], activeAccountId: accountB });
    expect(await readHackmdApiToken()).toBe('token-b');
    const stored = JSON.parse(await readFile(getSettingsPath(), 'utf8'));
    expect(Object.keys(stored.hackmdAccountTokensEncrypted)).toEqual([accountB]);

    // Forgetting the last account leaves no accounts behind.
    const emptied = await updateStoredSettings({ hackmdRemoveAccountId: accountB });
    expect(emptied.hackmdAccounts).toEqual({ accounts: [], activeAccountId: null });
    expect(emptied.hasHackmdApiToken).toBe(false);
    await expect(readHackmdApiToken()).rejects.toThrow('not configured');
  });

  it('encrypts the HackDesk copy of an imported CLI token and leaves the CLI configuration alone', async () => {
    await mkdir(join(electronMock.homePath, '.hackmd'), { recursive: true });
    const original = JSON.stringify({ accessToken: 'cli-private-secret' });
    await writeFile(getHackmdCliConfigPath(), original);
    await updateStoredSettings({ hackmdApiToken: await readHackmdCliAccessToken() });
    expect(await readHackmdApiToken()).toBe('cli-private-secret');
    expect(await readFile(getSettingsPath(), 'utf8')).not.toContain('cli-private-secret');
    expect(await readFile(getHackmdCliConfigPath(), 'utf8')).toBe(original);
  });

  it('preserves valid settings when a stored field or shortcut action is unknown', async () => {
    await mkdir(join(electronMock.homePath, '.hackdesk'), { recursive: true });
    await writeFile(getSettingsPath(), JSON.stringify({
      title: 'Workspace',
      hackmdApiToken: 'secret-token',
      localVault: { path: '/tmp/vault' },
      editor: { mode: 'nano' },
      shortcuts: {
        'open-command-palette': 'mod+shift+p',
        'removed-action': 'mod+j',
      },
    }));

    const settings = await readStoredSettings();

    expect(settings).toMatchObject({
      title: 'Workspace',
      hackmdApiToken: '',
      localVault: { vaults: [{ id: expect.any(String), path: '/tmp/vault' }], activeVaultId: expect.any(String) },
      editor: { mode: 'standard' },
      shortcuts: { 'open-command-palette': 'mod+shift+p' },
    });

    await updateStoredSettings({ title: 'Updated workspace' });
    const stored = JSON.parse(await readFile(getSettingsPath(), 'utf8'));
    expect(stored).toMatchObject({
      title: 'Updated workspace',
      hackmdApiToken: '',
      localVault: { vaults: [{ id: expect.any(String), path: '/tmp/vault' }], activeVaultId: expect.any(String) },
      editor: { mode: 'standard' },
      shortcuts: { 'open-command-palette': 'mod+shift+p' },
    });
    expect(await readHackmdApiToken()).toBe('secret-token');
    expect(JSON.stringify(stored)).not.toContain('secret-token');
  });

  it('does not overwrite malformed settings during an update', async () => {
    await mkdir(join(electronMock.homePath, '.hackdesk'), { recursive: true });
    await writeFile(getSettingsPath(), '{ invalid json');

    await expect(updateStoredSettings({ title: 'New title' })).rejects.toThrow('Invalid JSON format');
    await expect(readFile(getSettingsPath(), 'utf8')).resolves.toBe('{ invalid json');
  });

  it('serializes concurrent settings updates without losing fields', async () => {
    const [first, second] = await Promise.all([
      updateStoredSettings({ hackmdApiToken: 'token-123' }),
      updateStoredSettings({ localVaultPath: '/tmp/vault' }),
    ]);
    const stored = JSON.parse(await readFile(getSettingsPath(), 'utf8'));

    expect(first.hasHackmdApiToken).toBe(true);
    expect(second).toMatchObject({
      hasHackmdApiToken: true,
      localVault: { vaults: [{ id: expect.any(String), path: '/tmp/vault' }], activeVaultId: expect.any(String) },
    });
    expect(stored).toMatchObject({
      hackmdApiToken: '',
      localVault: { vaults: [{ id: expect.any(String), path: '/tmp/vault' }], activeVaultId: expect.any(String) },
    });
    expect(await readHackmdApiToken()).toBe('token-123');
  });

  it('choosing folders accumulates vaults and activates the latest one', async () => {
    const first = await updateStoredSettings({ localVaultPath: '/tmp/vault-a' });
    expect(first.localVault.vaults.map((vault) => vault.path)).toEqual(['/tmp/vault-a']);
    expect(first.hasLocalVault).toBe(true);

    const second = await updateStoredSettings({ localVaultPath: '/tmp/vault-b' });
    expect(second.localVault.vaults.map((vault) => vault.path)).toEqual(['/tmp/vault-a', '/tmp/vault-b']);
    expect(second.localVault.activeVaultId).toBe(second.localVault.vaults[1].id);

    // Re-choosing a known folder only activates it instead of duplicating it.
    const reselected = await updateStoredSettings({ localVaultPath: '/tmp/vault-a' });
    expect(reselected.localVault.vaults).toHaveLength(2);
    expect(reselected.localVault.activeVaultId).toBe(reselected.localVault.vaults[0].id);
    expect(await readStoredSettings()).toMatchObject({
      localVault: {
        vaults: [{ path: '/tmp/vault-a' }, { path: '/tmp/vault-b' }],
      },
    });
  });

  it('forgetting the active vault falls back to the first remaining one', async () => {
    await updateStoredSettings({ localVaultPath: '/tmp/vault-a' });
    await updateStoredSettings({ localVaultPath: '/tmp/vault-b' });

    const afterForget = await updateStoredSettings({ localVaultPath: null });
    expect(afterForget.localVault.vaults.map((vault) => vault.path)).toEqual(['/tmp/vault-a']);
    expect(afterForget.localVault.activeVaultId).toBe(afterForget.localVault.vaults[0].id);
    expect(afterForget.hasLocalVault).toBe(true);

    const emptied = await updateStoredSettings({ localVaultPath: null });
    expect(emptied.localVault).toEqual({ vaults: [], activeVaultId: null, workspaces: [], activeWorkspaceId: null });
    expect(emptied.hasLocalVault).toBe(false);
  });

  it('persists named workspaces and opens one as it is created', async () => {
    const first = await updateStoredSettings({ localVaultPath: '/tmp/vault-a' });
    await updateStoredSettings({ localVaultPath: '/tmp/vault-b' });
    const vaultA = first.localVault.vaults[0].id;

    const created = await updateStoredSettings({
      localWorkspace: { type: 'create', name: '  Work  ', vaultIds: [vaultA] },
    });
    expect(created.localVault.workspaces).toMatchObject([{ name: 'Work', vaultIds: [vaultA] }]);
    // Creating opens the set, and with it one of its folders.
    expect(created.localVault.activeWorkspaceId).toBe(created.localVault.workspaces[0].id);
    expect(created.localVault.activeVaultId).toBe(vaultA);

    const renamed = await updateStoredSettings({
      localWorkspace: { type: 'rename', id: created.localVault.workspaces[0].id, name: 'Studio' },
    });
    expect(renamed.localVault.workspaces[0].name).toBe('Studio');

    const widened = await updateStoredSettings({
      localWorkspace: { type: 'setVaults', id: created.localVault.workspaces[0].id, vaultIds: [vaultA, created.localVault.vaults[1].id] },
    });
    expect(widened.localVault.workspaces[0].vaultIds).toHaveLength(2);

    const closed = await updateStoredSettings({ localWorkspace: { type: 'activate', id: null } });
    expect(closed.localVault.activeWorkspaceId).toBeNull();

    const reopened = await updateStoredSettings({ localWorkspace: { type: 'activate', id: created.localVault.workspaces[0].id } });
    expect(reopened.localVault.activeWorkspaceId).toBe(created.localVault.workspaces[0].id);

    const deleted = await updateStoredSettings({ localWorkspace: { type: 'delete', id: created.localVault.workspaces[0].id } });
    expect(deleted.localVault.workspaces).toEqual([]);
    expect(deleted.localVault.activeWorkspaceId).toBeNull();
    // The folders stay known and openable after their set is gone.
    expect(deleted.localVault.vaults).toHaveLength(2);
    expect(await readStoredSettings()).toMatchObject({
      localVault: { workspaces: [], activeWorkspaceId: null },
    });
  });

  it('rejects an unknown workspace mutation without touching settings', async () => {
    await updateStoredSettings({ localVaultPath: '/tmp/vault-a' });
    const before = await readStoredSettings();
    const after = await updateStoredSettings({ localWorkspace: { type: 'rename', id: 'missing', name: 'X' } });
    expect(after.localVault.workspaces).toEqual([]);
    expect(after.localVault.vaults).toEqual(before.localVault.vaults);
  });

  it.each(['emacs', 'kakoune'] as const)('persists and returns the %s editor mode', async (mode) => {
    const safeSettings = await updateStoredSettings({
      editor: { mode },
    });
    const content = await readFile(getSettingsPath(), 'utf8');

    expect(safeSettings.editor).toEqual({ mode });
    expect(content).toContain(`"mode": "${mode}"`);
  });

  it('persists and returns shortcut overrides', async () => {
    const safeSettings = await updateStoredSettings({
      shortcuts: {
        'open-command-palette': 'mod+j',
        'open-quick-open': 'none',
      },
    });
    const content = await readFile(getSettingsPath(), 'utf8');

    expect(safeSettings.shortcuts).toEqual({
      'open-command-palette': 'mod+j',
      'open-quick-open': 'none',
    });
    expect(content).toContain('"open-command-palette": "mod+j"');
    expect(content).not.toContain('hackmdApiToken": "secret-token');
  });

  it('persists and returns the pinned workspace order', async () => {
    const safeSettings = await updateStoredSettings({
      workspaceNavigation: { pinnedTeamIds: ['team-2', 'team-1'] },
    });
    const content = await readFile(getSettingsPath(), 'utf8');

    expect(safeSettings.workspaceNavigation).toEqual({ pinnedTeamIds: ['team-2', 'team-1'] });
    expect(content).toContain('"pinnedTeamIds"');
    expect(content.indexOf('team-2')).toBeLessThan(content.indexOf('team-1'));
  });

  it('rejects invalid shortcut overrides', async () => {
    await expect(updateStoredSettings({
      shortcuts: {
        'open-command-palette': 'mod+d',
      },
    })).rejects.toThrow('Use a modifier-based shortcut');
  });

  it('persists and returns appearance typography settings', async () => {
    const safeSettings = await updateStoredSettings({
      appearance: {
        theme: 'dark',
        presetId: 'catppuccin',
        customSeed: {},
        typography: {
          uiFontStack: 'system-ui, sans-serif',
          editorFontStack: '"JetBrains Mono", ui-monospace, monospace',
          uiFontSize: 16,
          editorFontSize: 18,
          fontSmoothing: 'auto',
        },
      },
    });
    const content = await readFile(getSettingsPath(), 'utf8');

    expect(safeSettings.appearance).toMatchObject({
      theme: 'dark',
      presetId: 'catppuccin',
      typography: {
        uiFontStack: 'system-ui, sans-serif',
        editorFontStack: '"JetBrains Mono", ui-monospace, monospace',
        uiFontSize: 16,
        editorFontSize: 18,
        fontSmoothing: 'auto',
      },
    });
    expect(content).toContain('"presetId": "catppuccin"');
    expect(content).toContain('JetBrains Mono');
    expect(content).toContain('"uiFontSize": 16');
    expect(content).toContain('"editorFontSize": 18');
  });

  it('defers first-run onboarding without configuring a token', async () => {
    const safeSettings = await updateStoredSettings({
      onboarding: { hackmdTokenSetupDeferred: true },
    });

    expect(safeSettings).toMatchObject({
      hasHackmdApiToken: false,
      hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
      onboarding: { hackmdTokenSetupDeferred: true },
      shouldShowHackmdOnboarding: false,
    });
  });

  it('clears deferred onboarding when a token is saved', async () => {
    await updateStoredSettings({
      onboarding: { hackmdTokenSetupDeferred: true },
    });

    const safeSettings = await updateStoredSettings({
      hackmdApiToken: ' token-123 ',
    });
    const content = await readFile(getSettingsPath(), 'utf8');

    expect(safeSettings).toMatchObject({
      hasHackmdApiToken: true,
      hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
      onboarding: { hackmdTokenSetupDeferred: false },
      shouldShowHackmdOnboarding: false,
    });
    expect(content).not.toContain('token-123');
    expect(await readHackmdApiToken()).toBe('token-123');
  });

  it('clears a token without reopening deferred onboarding', async () => {
    await updateStoredSettings({
      hackmdApiToken: 'token-123',
    });

    const safeSettings = await updateStoredSettings({
      hackmdApiToken: '',
      onboarding: { hackmdTokenSetupDeferred: true },
    });
    const content = await readFile(getSettingsPath(), 'utf8');

    expect(safeSettings).toMatchObject({
      hasHackmdApiToken: false,
      onboarding: { hackmdTokenSetupDeferred: true },
      shouldShowHackmdOnboarding: false,
    });
    expect(content).toContain('"hackmdApiToken": ""');
  });

  it('reports missing hackmd-cli config as unavailable', async () => {
    await expect(getHackmdCliConfigStatus()).resolves.toEqual({
      hasAccessToken: false,
      hasCustomEndpoint: false,
    });
  });

  it('reports hackmd-cli token availability without exposing the token', async () => {
    await mkdir(join(electronMock.homePath, '.hackmd'), { recursive: true });
    await writeFile(getHackmdCliConfigPath(), JSON.stringify({
      accessToken: 'cli-secret',
    }));

    const safeSettings = await getSafeSettings();

    expect(safeSettings.hackmdCliConfig).toEqual({
      hasAccessToken: true,
      hasCustomEndpoint: false,
    });
    expect(JSON.stringify(safeSettings)).not.toContain('cli-secret');
  });

  it('ignores invalid hackmd-cli config JSON for safe settings', async () => {
    await mkdir(join(electronMock.homePath, '.hackmd'), { recursive: true });
    await writeFile(getHackmdCliConfigPath(), '{ invalid json');

    await expect(getHackmdCliConfigStatus()).resolves.toEqual({
      hasAccessToken: false,
      hasCustomEndpoint: false,
    });
  });

  it('reports custom hackmd-cli endpoints and blocks token import', async () => {
    await mkdir(join(electronMock.homePath, '.hackmd'), { recursive: true });
    await writeFile(getHackmdCliConfigPath(), JSON.stringify({
      accessToken: 'enterprise-token',
      hackmdAPIEndpointURL: 'https://hackmd.example.com/api',
    }));

    await expect(getHackmdCliConfigStatus()).resolves.toEqual({
      hasAccessToken: true,
      hasCustomEndpoint: true,
    });
    await expect(readHackmdCliAccessToken()).rejects.toThrow('custom endpoint import is not supported');
  });

  it('reads the hackmd-cli access token only for main-process import', async () => {
    await mkdir(join(electronMock.homePath, '.hackmd'), { recursive: true });
    await writeFile(getHackmdCliConfigPath(), JSON.stringify({
      accessToken: ' cli-secret ',
    }));

    await expect(readHackmdCliAccessToken()).resolves.toBe('cli-secret');
  });

  describe('damaged settings file', () => {
    const damaged = '{"title":"Workspace","hackmdApiTokenEncrypted":{"version":1},"localVault":{"path":"/tmp/vault"}';
    const writeDamaged = async (content = damaged) => {
      await mkdir(join(electronMock.homePath, '.hackdesk'), { recursive: true });
      await writeFile(getSettingsPath(), content);
    };

    it('reports missing and valid files as readable, and malformed or unreadable files as problems', async () => {
      await expect(inspectSettingsFile()).resolves.toBeNull();
      await updateStoredSettings({ title: 'Valid' });
      await expect(inspectSettingsFile()).resolves.toBeNull();
      await writeDamaged();
      await expect(inspectSettingsFile()).resolves.toMatchObject({ kind: 'invalid', message: 'Invalid JSON format', path: getSettingsPath() });
      await writeDamaged('[]');
      await expect(inspectSettingsFile()).resolves.toMatchObject({ kind: 'invalid' });
      await rm(getSettingsPath());
      await mkdir(getSettingsPath());
      await expect(inspectSettingsFile()).resolves.toMatchObject({ kind: 'unreadable', message: expect.stringContaining('EISDIR') });
    });

    it('never writes defaults over a damaged file during normal reads and updates', async () => {
      await writeDamaged();
      await expect(readStoredSettings()).rejects.toThrow('Invalid JSON format');
      await expect(getSafeSettings()).rejects.toThrow('Invalid JSON format');
      await expect(updateStoredSettings({ title: 'Overwrite' })).rejects.toThrow('Invalid JSON format');
      await expect(readHackmdApiToken()).rejects.toThrow('Invalid JSON format');
      expect(await readFile(getSettingsPath(), 'utf8')).toBe(damaged);
      expect(await readdir(join(electronMock.homePath, '.hackdesk'))).toEqual(['settings.json']);
    });

    it('keeps the exact damaged bytes as a backup before writing valid defaults', async () => {
      await writeDamaged();
      const result = await resetDamagedSettingsFile();
      expect(result?.backupPath).toMatch(/settings\.json\.damaged-/);
      expect(await readFile(result!.backupPath, 'utf8')).toBe(damaged);
      await expect(inspectSettingsFile()).resolves.toBeNull();
      expect(await readStoredSettings()).toMatchObject({ title: defaultSettings.title, localVault: { vaults: [], activeVaultId: null } });
      if (process.platform !== 'win32') expect((await stat(getSettingsPath())).mode & 0o777).toBe(0o600);
    });

    it('leaves a readable file alone and keeps the damaged file when the backup move fails', async () => {
      await updateStoredSettings({ title: 'Valid', localVaultPath: '/tmp/vault' });
      const valid = await readFile(getSettingsPath(), 'utf8');
      await expect(resetDamagedSettingsFile()).resolves.toBeNull();
      expect(await readFile(getSettingsPath(), 'utf8')).toBe(valid);

      await writeDamaged();
      fsMock.failRename = true;
      await expect(resetDamagedSettingsFile()).rejects.toThrow('Test disk failure');
      expect(await readFile(getSettingsPath(), 'utf8')).toBe(damaged);
      expect(await readdir(join(electronMock.homePath, '.hackdesk'))).toEqual(['settings.json']);
    });

    it('restores the damaged file when defaults cannot be written, so startup stays blocked', async () => {
      await writeDamaged();
      fsMock.failOpen = true;
      await expect(resetDamagedSettingsFile()).rejects.toThrow('The original file was restored.');
      expect(await readFile(getSettingsPath(), 'utf8')).toBe(damaged);
      expect(await readdir(join(electronMock.homePath, '.hackdesk'))).toEqual(['settings.json']);
      await expect(inspectSettingsFile()).resolves.toMatchObject({ kind: 'invalid' });
    });

    it('reports the backup path when defaults cannot be written and the restore fails', async () => {
      await writeDamaged();
      fsMock.failOpen = true;
      fsMock.failRenameAfter = 1;
      const error = await resetDamagedSettingsFile().catch((reason: Error) => reason);
      const [backup] = (await readdir(join(electronMock.homePath, '.hackdesk'))).filter((file) => file.startsWith('settings.json.damaged-'));
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain(`The damaged file is saved as ${join(electronMock.homePath, '.hackdesk', backup)}.`);
      expect(await readFile(join(electronMock.homePath, '.hackdesk', backup), 'utf8')).toBe(damaged);
    });
  });
});
