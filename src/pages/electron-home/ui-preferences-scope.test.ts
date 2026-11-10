import { beforeEach, describe, expect, it } from 'vitest';

import {
  LAST_WORKSPACE_SCOPE_KEY,
  readWorkspaceScopeStorage,
  writeWorkspaceScopeStorage,
} from './ui-preferences';

describe('workspace scope preference', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips a local scope with its vault id', () => {
    writeWorkspaceScopeStorage(LAST_WORKSPACE_SCOPE_KEY, { type: 'local', label: 'Notes', vaultId: 'vault-notes' });
    expect(readWorkspaceScopeStorage(LAST_WORKSPACE_SCOPE_KEY, { type: 'personal', label: 'My Workspace' })).toEqual({
      type: 'local',
      label: 'Notes',
      vaultId: 'vault-notes',
    });
  });

  it('drops a blank vault id and falls back without a label', () => {
    window.localStorage.setItem(LAST_WORKSPACE_SCOPE_KEY, JSON.stringify({ type: 'local', label: '', vaultId: '  ' }));
    expect(readWorkspaceScopeStorage(LAST_WORKSPACE_SCOPE_KEY, { type: 'personal', label: 'My Workspace' })).toEqual({
      type: 'local',
      label: 'Local Vault',
    });
  });
});
