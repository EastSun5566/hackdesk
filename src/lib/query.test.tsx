import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { invoke } from '@tauri-apps/api/core';

import { useSettings, useUpdateSettings } from './query';
import type { AppSettings } from './settings';
import { defaultSettings } from './settings';
import { readSettings, writeSettings } from './utils';

const readSettingsMock = readSettings as unknown as ReturnType<typeof vi.fn>;
const writeSettingsMock = writeSettings as unknown as ReturnType<typeof vi.fn>;
const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;

vi.mock('./utils', () => ({
  readSettings: vi.fn(),
  writeSettings: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
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
  });

  it('parses settings into typed data', async () => {
    readSettingsMock.mockResolvedValue('{"title":"Workspace"}');
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual({ title: 'Workspace' });
    });
  });

  it('falls back to defaults for invalid persisted settings', async () => {
    readSettingsMock.mockResolvedValue('{');
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(defaultSettings);
    });
  });

  it('writes normalized settings and applies them', async () => {
    writeSettingsMock.mockResolvedValue(undefined);
    invokeMock.mockResolvedValue(undefined);
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateSettings(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ title: 'Focus Desk' });
    });

    expect(writeSettingsMock).toHaveBeenCalledWith(`{
  "title": "Focus Desk"
}`);
    expect(queryClient.getQueryData(['settings'])).toEqual({ title: 'Focus Desk' });
    expect(invokeMock).toHaveBeenCalledWith('apply_settings');
  });

  it('rejects invalid settings before writing them', async () => {
    writeSettingsMock.mockResolvedValue(undefined);
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateSettings(), { wrapper });

    await expect(
      result.current.mutateAsync({ title: '' } as AppSettings),
    ).rejects.toThrow('Title is required');

    expect(writeSettingsMock).not.toHaveBeenCalled();
  });
});