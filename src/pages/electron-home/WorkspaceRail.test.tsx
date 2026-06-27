import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceRail } from './WorkspaceRail';

function renderWorkspaceRail(overrides: Partial<Parameters<typeof WorkspaceRail>[0]> = {}) {
  const props: Parameters<typeof WorkspaceRail>[0] = {
    id: 'workspace-rail',
    scope: { type: 'personal', label: 'My Workspace' },
    user: undefined,
    teams: [],
    collapsed: false,
    localVaultConfigured: false,
    width: 72,
    onChooseLocalVault: vi.fn(),
    onScopeChange: vi.fn(),
    onOpenSettings: vi.fn(),
    ...overrides,
  };

  render(<WorkspaceRail {...props} />);
  return props;
}

describe('WorkspaceRail', () => {
  it('opens the local vault picker when no vault is configured', () => {
    const props = renderWorkspaceRail({ localVaultConfigured: false });

    fireEvent.click(screen.getByRole('button', { name: 'Local Vault' }));

    expect(props.onChooseLocalVault).toHaveBeenCalledOnce();
    expect(props.onScopeChange).not.toHaveBeenCalled();
  });

  it('switches to local workspace after a vault is configured', () => {
    const props = renderWorkspaceRail({ localVaultConfigured: true });

    fireEvent.click(screen.getByRole('button', { name: 'Local Vault' }));

    expect(props.onScopeChange).toHaveBeenCalledWith({ type: 'local', label: 'Local Vault' });
    expect(props.onChooseLocalVault).not.toHaveBeenCalled();
  });
});
