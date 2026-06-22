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
        settings={{ title: 'HackDesk', appearance: defaultSettings.appearance, hasHackmdApiToken: false }}
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

    const dialog = screen.getByRole('dialog', { name: 'Settings' });

    expect(dialog).toHaveClass('overflow-y-auto');
    expect(dialog.className).toContain('max-h-[');
    expect(screen.getByLabelText('API Token')).toBeInTheDocument();
  });

  it('closes the dialog after applying a theme', () => {
    const { onOpenChange } = renderSettingsDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Apply Theme' }));

    expect(toastSuccessMock).toHaveBeenCalledWith('Theme applied');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
