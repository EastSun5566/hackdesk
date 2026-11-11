import { describe, expect, it } from 'vitest';
import { trashNavigatorRowLabel, workspaceRootLabel } from './workspace-root-labels';

describe('workspaceRootLabel', () => {
  it('names a team root by what it holds, not the team the switcher already shows', () => {
    const scope = { type: 'team', label: 'docs', teamPath: 'docs' } as const;
    expect(workspaceRootLabel(scope)).toBe('Team Notes');
    expect(trashNavigatorRowLabel(scope)).toBe('Team Trash');
  });

  it('keeps My Notes for the personal workspace', () => {
    expect(workspaceRootLabel({ type: 'personal', label: 'My Workspace' })).toBe('My Notes');
  });

  it('keeps naming a local root after its working set or folder', () => {
    const scope = { type: 'local', label: 'Local', vaultId: 'v1' } as const;
    expect(workspaceRootLabel(scope, 'vault', 'Set')).toBe('Set');
    expect(workspaceRootLabel(scope, 'vault')).toBe('vault');
  });
});
