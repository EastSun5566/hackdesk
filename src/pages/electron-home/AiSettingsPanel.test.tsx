import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiProviderId, AiProviderStatus } from '@/lib/ai';
import { defaultSettings, type AiSettings } from '@/lib/settings';

import { AiSettingsPanel } from './AiSettingsPanel';

const first = { id: '0b6a8f4e-2d64-4f0e-9a6c-3f1f2a1c9d10', name: 'First', prompt: 'One', delivery: 'replace' as const };
const second = { id: '1b6a8f4e-2d64-4f0e-9a6c-3f1f2a1c9d10', name: 'Second', prompt: 'Two', delivery: 'insert-below' as const };

function status(id: AiProviderId, overrides: Partial<AiProviderStatus> = {}): AiProviderStatus {
  return {
    id, enabled: id === 'claude', phase: 'ready', message: null, version: '1', command: `/bin/${id}`,
    plan: null, models: [], usage: null, apiKeyInEnvironment: false, ...overrides,
  };
}

function installApi({ apiKeyInEnvironment = false } = {}) {
  let ai: AiSettings = {
    ...defaultSettings.ai,
    providers: { ...defaultSettings.ai.providers, claude: { ...defaultSettings.ai.providers.claude, enabled: true } },
    customCommands: [first, second],
  };
  const update = vi.fn(async (input: { ai: AiSettings }) => {
    ai = input.ai;
    return { ai };
  });
  window.hackdeskAPI = {
    getRuntimeEnvironment: () => 'electron',
    settings: { get: vi.fn(async () => ({ ai })), update },
    app: { confirm: vi.fn(async () => ({ confirmed: true })) },
    ai: {
      listProviders: vi.fn(async () => [status('codex'), status('claude', { apiKeyInEnvironment })]),
      refreshProvider: vi.fn(async (id: AiProviderId) => status(id, { apiKeyInEnvironment: id === 'claude' && apiKeyInEnvironment })),
      runTurn: vi.fn(),
      cancelTurn: vi.fn(),
    },
  } as unknown as typeof window.hackdeskAPI;
  return { update };
}

afterEach(() => {
  delete window.hackdeskAPI;
});

describe('AiSettingsPanel', () => {
  it('offers the subscription switch only when an ANTHROPIC_API_KEY is exported', async () => {
    const { update } = installApi({ apiKeyInEnvironment: true });
    render(<AiSettingsPanel active />);
    const toggle = await screen.findByRole('switch', { name: 'Use my Claude subscription instead of ANTHROPIC_API_KEY' });
    fireEvent.click(toggle);
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls.at(-1)![0].ai.providers.claude.ignoreApiKey).toBe(true);
  });

  it('hides the subscription switch without an exported key', async () => {
    installApi();
    render(<AiSettingsPanel active />);
    await screen.findByText('First');
    expect(screen.queryByRole('switch', { name: 'Use my Claude subscription instead of ANTHROPIC_API_KEY' })).not.toBeInTheDocument();
  });

  it('reorders custom commands, with the ends unable to move further', async () => {
    const { update } = installApi();
    render(<AiSettingsPanel active />);
    await screen.findByText('First');
    expect(screen.getByRole('button', { name: 'Move First up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Second down' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Move Second up' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls.at(-1)![0].ai.customCommands.map(command => command.name)).toEqual(['Second', 'First']);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move Second up' })).toBeDisabled());
  });
});
