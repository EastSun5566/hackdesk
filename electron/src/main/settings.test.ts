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
const fsMock = vi.hoisted(() => ({ failRename: false }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  const rename = async (...args: Parameters<typeof fs.rename>) => {
    if (fsMock.failRename) throw new Error('Test disk failure');
    return fs.rename(...args);
  };
  return { ...fs, rename, default: { ...fs, rename } };
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

import { getHackmdCliConfigPath, getSettingsPath } from './paths';
import {
  getHackmdCliConfigStatus,
  getSafeSettings,
  readStoredSettings,
  readHackmdApiToken,
  readHackmdCliAccessToken,
  updateStoredSettings,
} from './settings';

describe('Electron settings', () => {
  beforeEach(async () => {
    fsMock.failRename = false;
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
    await updateStoredSettings({ hackmdApiToken: 'private-secret', title: 'Workspace' });
    const stored = JSON.parse(await readFile(getSettingsPath(), 'utf8'));
    expect(stored).toMatchObject({ hackmdApiToken: '', hackmdApiTokenEncrypted: { version: 1, ciphertext: expect.any(String) } });
    expect(JSON.stringify(stored)).not.toContain('private-secret');
    expect(await readHackmdApiToken()).toBe('private-secret');
    expect(await readStoredSettings()).toMatchObject({ title: 'Workspace', hackmdApiToken: '' });
    expect(await readdir(join(electronMock.homePath, '.hackdesk'))).toEqual(['settings.json']);
    if (process.platform !== 'win32') expect((await stat(getSettingsPath())).mode & 0o777).toBe(0o600);
  });

  it('serializes legacy migration with settings updates and preserves unrelated fields', async () => {
    await mkdir(join(electronMock.homePath, '.hackdesk'), { recursive: true });
    await writeFile(getSettingsPath(), JSON.stringify({ title: 'Old', hackmdApiToken: 'legacy-secret' }));
    await Promise.all([getSafeSettings(), updateStoredSettings({ title: 'New', localVaultPath: '/tmp/vault' })]);
    expect(await readStoredSettings()).toMatchObject({ title: 'New', localVault: { path: '/tmp/vault' } });
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
    expect(await readStoredSettings()).toMatchObject({ title: 'Workspace', localVault: { path: '/tmp/vault' } });
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
      title: 'Still local', localVault: { path: '/tmp/vault' },
      hackmdTokenStorageError: expect.stringContaining('could not be protected'),
    });
    expect(JSON.parse(await readFile(getSettingsPath(), 'utf8')).hackmdApiToken).toBe('legacy-secret');
    await expect(readHackmdApiToken()).rejects.toThrow('could not be protected');
    await expect(updateStoredSettings({ hackmdApiToken: 'new-secret' })).rejects.toThrow('unavailable');
    await updateStoredSettings({ localVaultPath: null });
    electronMock.available = true;
    expect(await readHackmdApiToken()).toBe('legacy-secret');
    expect(await readStoredSettings()).toMatchObject({ title: 'Still local', localVault: { path: null } });
    expect(await readFile(getSettingsPath(), 'utf8')).not.toContain('legacy-secret');
  });

  it('preserves encrypted tokens and local settings when the keyring is unavailable, but allows explicit clearing', async () => {
    await updateStoredSettings({ hackmdApiToken: 'saved-secret', localVaultPath: '/tmp/vault' });
    const encrypted = JSON.parse(await readFile(getSettingsPath(), 'utf8')).hackmdApiTokenEncrypted;
    electronMock.available = false;
    expect(await readStoredSettings()).toMatchObject({ localVault: { path: '/tmp/vault' } });
    expect(await getSafeSettings()).toMatchObject({ hasHackmdApiToken: true, hackmdTokenStorageError: expect.stringContaining('unavailable') });
    await expect(readHackmdApiToken()).rejects.toThrow('unavailable');
    await updateStoredSettings({ title: 'Still local' });
    await expect(updateStoredSettings({ hackmdApiToken: 'new-secret' })).rejects.toThrow('unavailable');
    expect(JSON.parse(await readFile(getSettingsPath(), 'utf8'))).toMatchObject({ title: 'Still local', hackmdApiTokenEncrypted: encrypted });
    await updateStoredSettings({ hackmdApiToken: '' });
    expect((await getSafeSettings()).hasHackmdApiToken).toBe(false);
    expect(JSON.parse(await readFile(getSettingsPath(), 'utf8'))).not.toHaveProperty('hackmdApiTokenEncrypted');
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
      expect(JSON.parse(await readFile(getSettingsPath(), 'utf8')).hackmdApiTokenEncrypted).toEqual(encrypted);
      await updateStoredSettings({ hackmdApiToken: 'replacement' });
      expect(await readHackmdApiToken()).toBe('replacement');
    },
  );

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
      localVault: { path: '/tmp/vault' },
      editor: { mode: 'standard' },
      shortcuts: { 'open-command-palette': 'mod+shift+p' },
    });

    await updateStoredSettings({ title: 'Updated workspace' });
    const stored = JSON.parse(await readFile(getSettingsPath(), 'utf8'));
    expect(stored).toMatchObject({
      title: 'Updated workspace',
      hackmdApiToken: '',
      localVault: { path: '/tmp/vault' },
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
      localVault: { path: '/tmp/vault' },
    });
    expect(stored).toMatchObject({
      hackmdApiToken: '',
      localVault: { path: '/tmp/vault' },
    });
    expect(await readHackmdApiToken()).toBe('token-123');
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
});
