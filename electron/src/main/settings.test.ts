import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  homePath: '',
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.homePath),
  },
}));

import { getHackmdCliConfigPath, getSettingsPath } from './paths';
import {
  getHackmdCliConfigStatus,
  getSafeSettings,
  readHackmdCliAccessToken,
  updateStoredSettings,
} from './settings';

describe('Electron settings', () => {
  beforeEach(async () => {
    electronMock.homePath = await mkdtemp(join(tmpdir(), 'hackdesk-settings-'));
  });

  afterEach(async () => {
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
      hasHackmdApiToken: true,
      hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
      onboarding: { hackmdTokenSetupDeferred: false },
      shouldShowHackmdOnboarding: false,
    });
    expect('hackmdApiToken' in safeSettings).toBe(false);
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
    expect(content).toContain('"hackmdApiToken": "token-123"');
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
