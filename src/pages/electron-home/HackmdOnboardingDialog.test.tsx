import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { UserSummary } from '@/lib/electron-api';
import { defaultSettings } from '@/lib/settings';

import { HackmdOnboardingDialog } from './HackmdOnboardingDialog';

const user: UserSummary = {
  id: 'user-1',
  email: 'michael@example.com',
  name: 'Michael',
  username: 'michael',
  photo: null,
  upgraded: false,
  teams: [],
};

function renderOnboarding(overrides: Partial<Parameters<typeof HackmdOnboardingDialog>[0]> = {}) {
  const props: Parameters<typeof HackmdOnboardingDialog>[0] = {
    open: true,
    hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
    onImportHackmdCliToken: vi.fn(async () => ({
      settings: {
        title: 'HackDesk',
        appearance: defaultSettings.appearance,
        hasHackmdApiToken: true,
        hasAppearanceSettings: true,
        hackmdCliConfig: { hasAccessToken: true, hasCustomEndpoint: false },
        onboarding: { hackmdTokenSetupDeferred: false },
        shouldShowHackmdOnboarding: false,
      },
      user,
    })),
    onOpenChange: vi.fn(),
    onOpenHackmdSettings: vi.fn(),
    onSaveToken: vi.fn(async () => undefined),
    onSetupLater: vi.fn(async () => undefined),
    onValidateToken: vi.fn(async () => user),
    ...overrides,
  };

  render(<HackmdOnboardingDialog {...props} />);
  return props;
}

describe('HackmdOnboardingDialog', () => {
  it('hides hackmd-cli import when no CLI token exists', () => {
    renderOnboarding();

    expect(screen.queryByText('Token found in hackmd-cli')).not.toBeInTheDocument();
  });

  it('lets users defer token setup', async () => {
    const props = renderOnboarding();

    fireEvent.click(screen.getByRole('button', { name: 'Setup later' }));

    await waitFor(() => expect(props.onSetupLater).toHaveBeenCalledOnce());
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('validates a token before saving it', async () => {
    const props = renderOnboarding();

    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    fireEvent.change(screen.getByLabelText('HackMD API Token'), {
      target: { value: ' pasted-token ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(props.onValidateToken).toHaveBeenCalledWith('pasted-token'));
    await waitFor(() => expect(props.onSaveToken).toHaveBeenCalledWith('pasted-token'));
    expect(await screen.findByText('Connected as Michael (@michael).')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start using HackDesk' }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows validation errors without saving the token', async () => {
    const props = renderOnboarding({
      onValidateToken: vi.fn(async () => {
        throw new Error('Invalid token');
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    fireEvent.change(screen.getByLabelText('HackMD API Token'), {
      target: { value: 'bad-token' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findAllByText('Invalid token')).not.toHaveLength(0);
    expect(props.onSaveToken).not.toHaveBeenCalled();
  });

  it('opens HackMD settings from the token step', () => {
    const props = renderOnboarding();

    fireEvent.click(screen.getByRole('button', { name: 'Get started' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open HackMD settings' }));

    expect(props.onOpenHackmdSettings).toHaveBeenCalledOnce();
  });

  it('imports an available hackmd-cli token', async () => {
    const props = renderOnboarding({
      hackmdCliConfig: { hasAccessToken: true, hasCustomEndpoint: false },
    });

    expect(screen.getByText('Token found in hackmd-cli')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import from hackmd-cli' }));

    await waitFor(() => expect(props.onImportHackmdCliToken).toHaveBeenCalledOnce());
    expect(await screen.findByText('Connected as Michael (@michael).')).toBeInTheDocument();
  });

  it('shows import errors while keeping manual token setup available', async () => {
    const props = renderOnboarding({
      hackmdCliConfig: { hasAccessToken: true, hasCustomEndpoint: false },
      onImportHackmdCliToken: vi.fn(async () => {
        throw new Error('CLI token is invalid');
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Import from hackmd-cli' }));

    expect(await screen.findAllByText('CLI token is invalid')).not.toHaveLength(0);
    expect(screen.getByLabelText('HackMD API Token')).toBeInTheDocument();
    expect(props.onSaveToken).not.toHaveBeenCalled();
  });

  it('disables hackmd-cli import for custom endpoints', () => {
    renderOnboarding({
      hackmdCliConfig: { hasAccessToken: true, hasCustomEndpoint: true },
    });

    expect(screen.getByText('Custom endpoint is not imported in this version.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import from hackmd-cli' })).toBeDisabled();
  });
});
