import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';
import { defaultSettings } from '@/lib/settings';

import { SettingsDialog } from './SettingsDialog';

// Shared fixtures for the SettingsDialog.*.test.tsx files. The suite is split by settings area so
// the renderer workers run it in parallel: each test renders the whole dialog (about a second).
export function renderSettingsDialog(props: Partial<Parameters<typeof SettingsDialog>[0]> = {}) {
  const onOpenChange = props.onOpenChange ?? vi.fn();
  const onChooseLocalVault = props.onChooseLocalVault ?? vi.fn(async () => undefined);
  const onDisconnectHackmd = props.onDisconnectHackmd ?? vi.fn();
  const onForgetLocalVault = props.onForgetLocalVault ?? vi.fn(async () => undefined);
  const onSwitchLocalVault = props.onSwitchLocalVault ?? vi.fn(async () => undefined);
  const onOpenLocalVault = props.onOpenLocalVault ?? vi.fn(async () => undefined);
  const onRefreshLocalVault = props.onRefreshLocalVault ?? vi.fn(async () => undefined);
  const onSave = props.onSave ?? vi.fn();
  const onValidateToken = props.onValidateToken ?? vi.fn();
  const settings = props.settings ?? {
    title: 'HackDesk',
    workspaceNavigation: defaultSettings.workspaceNavigation,
    appearance: defaultSettings.appearance,
    editor: defaultSettings.editor,
    hasHackmdApiToken: false,
    hackmdAccounts: { accounts: [], activeAccountId: null },
    hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
    hasLocalVault: false,
    localVault: defaultSettings.localVault,
    onboarding: defaultSettings.onboarding,
    shouldShowHackmdOnboarding: true,
  };
  const renderDialog = (nextProps: Partial<Parameters<typeof SettingsDialog>[0]> = {}) => (
    <ThemeProvider defaultTheme="system" storageKey="settings-dialog-test-theme">
      <SettingsDialog
        open
        settings={settings}
        platform="darwin"
        isSaving={false}
        onChooseLocalVault={onChooseLocalVault}
        onDisconnectHackmd={onDisconnectHackmd}
        onForgetLocalVault={onForgetLocalVault}
        onSwitchLocalVault={onSwitchLocalVault}
        onOpenLocalVault={onOpenLocalVault}
        onRefreshLocalVault={onRefreshLocalVault}
        onOpenChange={onOpenChange}
        onSave={onSave}
        onValidateToken={onValidateToken}
        {...props}
        {...nextProps}
      />
    </ThemeProvider>
  );
  const renderResult = render(renderDialog());

  return {
    onChooseLocalVault,
    onDisconnectHackmd,
    onForgetLocalVault,
    onSwitchLocalVault,
    onOpenLocalVault,
    onRefreshLocalVault,
    onOpenChange,
    onSave,
    onValidateToken,
    rerenderSettingsDialog: (nextProps: Partial<Parameters<typeof SettingsDialog>[0]>) => {
      renderResult.rerender(renderDialog(nextProps));
    },
  };
}

export async function selectThemeOption(optionName: string | RegExp) {
  const trigger = screen.getByRole('combobox', { name: 'Theme preset' });
  fireEvent.pointerDown(trigger);
  fireEvent.click(trigger);
  const option = await screen.findByRole('option', { name: optionName });
  fireEvent.pointerDown(option);
  fireEvent.click(option);
}

export async function previewDraculaTheme() {
  fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));
  await selectThemeOption('Dracula');
  await waitFor(() => {
    expect(document.documentElement.dataset.themePreset).toBe('dracula');
  });
}

export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

export const validatedUser = {
  email: 'michael@example.com',
  id: 'user-1',
  name: 'Michael',
  photo: null,
  teams: [],
  upgraded: false,
  username: 'michael5566',
};
