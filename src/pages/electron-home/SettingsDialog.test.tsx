import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '@/components/theme-provider';
import { defaultSettings } from '@/lib/settings';

import { SettingsDialog } from './SettingsDialog';

const { toastSuccessMock } = vi.hoisted(() => ({
  toastSuccessMock: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: toastSuccessMock,
  },
}));

function renderSettingsDialog(props: Partial<Parameters<typeof SettingsDialog>[0]> = {}) {
  const onOpenChange = props.onOpenChange ?? vi.fn();
  const onSave = props.onSave ?? vi.fn();
  const onValidateToken = props.onValidateToken ?? vi.fn();

  render(
    <ThemeProvider defaultTheme="system" storageKey="settings-dialog-test-theme">
      <SettingsDialog
        open
        settings={{
          title: 'HackDesk',
          appearance: defaultSettings.appearance,
          hasHackmdApiToken: false,
          hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
          onboarding: defaultSettings.onboarding,
          shouldShowHackmdOnboarding: true,
        }}
        isSaving={false}
        onOpenChange={onOpenChange}
        onSave={onSave}
        onValidateToken={onValidateToken}
        {...props}
      />
    </ThemeProvider>,
  );

  return { onOpenChange, onSave, onValidateToken };
}

describe('SettingsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('keeps the dialog body scrollable when settings content is taller than the viewport', () => {
    renderSettingsDialog();

    const tabpanel = screen.getByRole('tabpanel', { name: 'General' });

    expect(tabpanel).toHaveClass('overflow-y-auto');
    expect(tabpanel).toHaveClass('overscroll-contain');
    expect(tabpanel.className).toContain('[scrollbar-gutter:stable]');
  });

  it('shows one settings section per tab instead of one long form', () => {
    renderSettingsDialog();

    expect(screen.getByRole('tab', { name: /General/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Window Title')).toBeInTheDocument();
    expect(screen.queryByLabelText('API Token')).not.toBeInTheDocument();
    expect(screen.queryByText('Apply Theme')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    expect(screen.getByLabelText('API Token')).toBeInTheDocument();
    expect(screen.queryByLabelText('Window Title')).not.toBeInTheDocument();
  });

  it('closes the dialog after applying a theme from the appearance footer', () => {
    const { onOpenChange } = renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply Theme' }));

    expect(toastSuccessMock).toHaveBeenCalledWith('Theme applied');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps custom seed inputs collapsed until requested and disables apply for invalid color', () => {
    renderSettingsDialog();

    fireEvent.click(screen.getByRole('tab', { name: /Appearance/ }));

    expect(screen.queryByLabelText('Primary')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Customize Colors' }));
    fireEvent.change(screen.getByLabelText('Primary'), {
      target: { value: 'blue' },
    });

    expect(screen.getByText('Use a 6-digit hex color, for example #5D54E8.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply Theme' })).toBeDisabled();
  });

  it('saves title and token from their tab-specific footer action', () => {
    const { onSave } = renderSettingsDialog();

    fireEvent.change(screen.getByLabelText('Window Title'), {
      target: { value: 'Focus Desk' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledWith({ title: 'Focus Desk' });

    fireEvent.click(screen.getByRole('tab', { name: /HackMD/ }));
    fireEvent.change(screen.getByLabelText('API Token'), {
      target: { value: ' secret-token ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenLastCalledWith({
      title: 'Focus Desk',
      hackmdApiToken: 'secret-token',
    });
  });
});
