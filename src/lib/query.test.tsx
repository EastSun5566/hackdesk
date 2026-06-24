import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettings, useUpdateSettings } from './query';
import type { AppSettings } from './settings';
import { defaultSettings } from './settings';
import * as utils from './utils';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe('query hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(utils, 'readSettings');
    vi.spyOn(utils, 'writeSettings');
  });

  it('parses settings into typed data', async () => {
    vi.mocked(utils.readSettings).mockResolvedValue('{"title":"Workspace"}');
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual({
        title: 'Workspace',
        hackmdApiToken: '',
        appearance: defaultSettings.appearance,
        onboarding: defaultSettings.onboarding,
      });
    });
  });

  it('falls back to defaults for invalid persisted settings', async () => {
    vi.mocked(utils.readSettings).mockResolvedValue('{');
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(defaultSettings);
    });
  });

  it('writes normalized settings and applies them', async () => {
    vi.mocked(utils.writeSettings).mockResolvedValue(undefined);
    invokeMock.mockResolvedValue(undefined);
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateSettings(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ title: 'Focus Desk', hackmdApiToken: 'secret-token' });
    });

    expect(utils.writeSettings).toHaveBeenCalledWith(`{
  "title": "Focus Desk",
  "hackmdApiToken": "secret-token",
  "appearance": {
    "theme": "system",
    "presetId": "hackmd",
    "customSeed": {}
  },
  "onboarding": {
    "hackmdTokenSetupDeferred": false
  }
}`);
    expect(queryClient.getQueryData(['settings'])).toEqual({
      title: 'Focus Desk',
      hackmdApiToken: 'secret-token',
      appearance: defaultSettings.appearance,
      onboarding: defaultSettings.onboarding,
    });
    expect(invokeMock).toHaveBeenCalledWith('apply_settings');
  });

  it('rejects invalid settings before writing them', async () => {
    vi.mocked(utils.writeSettings).mockResolvedValue(undefined);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateSettings(), { wrapper });

    await expect(
      result.current.mutateAsync({ title: '', hackmdApiToken: '' } as AppSettings),
    ).rejects.toThrow('Title is required');

    expect(utils.writeSettings).not.toHaveBeenCalled();
  });
});
