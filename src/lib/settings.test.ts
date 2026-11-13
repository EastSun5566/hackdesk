import { describe, expect, it, vi } from 'vitest';

import {
  addHackmdAccount,
  addLocalVault,
  createLocalWorkspace,
  getActiveLocalWorkspace,
  getLocalWorkspaceVaults,
  normalizeLocalVaultSettings,
  removeLocalWorkspace,
  renameLocalWorkspace,
  setActiveLocalWorkspace,
  setLocalWorkspaceVaults,
  defaultHackmdAccountsSettings,
  defaultLocalVaultSettings,
  defaultSettings,
  getActiveHackmdAccount,
  getActiveLocalVaultPath,
  normalizeHackmdAccountsSettings,
  parseSettings,
  parseSettingsOrDefault,
  parseStoredSettings,
  removeHackmdAccount,
  removeLocalVault,
  serializeSettings,
  setActiveHackmdAccount,
  setActiveLocalVault,
  validateSettings,
} from './settings';

describe('settings helpers', () => {
  it('defaults older settings to character navigation and preserves explicit disable', () => {
    expect(parseSettings('{"title":"HackDesk"}').keyboardNavigation.characterShortcutsEnabled).toBe(true);
    expect(parseStoredSettings('{"title":"HackDesk","keyboardNavigation":{"characterShortcutsEnabled":false}}').keyboardNavigation.characterShortcutsEnabled).toBe(false);
    // Settings saved before key hints existed show them.
    expect(parseStoredSettings('{"title":"HackDesk","keyboardNavigation":{"characterShortcutsEnabled":false}}').keyboardNavigation.keyHintsVisible).toBe(true);
  });
  it('parses valid settings content', () => {
    expect(parseSettings('{"title":"Workspace"}')).toEqual({
      title: 'Workspace',
      hackmdApiToken: '',
      hackmdAccounts: defaultSettings.hackmdAccounts,
      appearance: defaultSettings.appearance,
      onboarding: defaultSettings.onboarding,
      localVault: defaultSettings.localVault,
      editor: defaultSettings.editor,
      shortcuts: defaultSettings.shortcuts,
      keyboardNavigation: defaultSettings.keyboardNavigation,
      workspaceNavigation: defaultSettings.workspaceNavigation,
      ai: defaultSettings.ai,
      dictation: defaultSettings.dictation,
      offline: defaultSettings.offline,
      quickCapture: defaultSettings.quickCapture,
      appIcon: defaultSettings.appIcon,
    });
  });
  it('keeps opened HackMD notes offline by default and drops a damaged offline section', () => {
    expect(defaultSettings.offline).toEqual({ keepHackmdNotes: true });
    expect(parseStoredSettings(JSON.stringify({ title: 'Workspace', offline: { keepHackmdNotes: false } })).offline)
      .toEqual({ keepHackmdNotes: false });
    expect(parseStoredSettings(JSON.stringify({ title: 'Workspace', offline: { keepHackmdNotes: 'no' } })).offline)
      .toEqual(defaultSettings.offline);
  });

  it('closes Quick Hack after capture by default and drops a damaged Quick Hack setting alone', () => {
    expect(defaultSettings.quickCapture).toEqual({ keepOpen: false, pinShortcut: 'mod+shift+p', toggleShortcut: 'control+alt+h' });
    expect(parseStoredSettings(JSON.stringify({ title: 'Workspace', quickCapture: { keepOpen: true } })).quickCapture)
      .toEqual({ ...defaultSettings.quickCapture, keepOpen: true });
    expect(parseStoredSettings(JSON.stringify({ title: 'Workspace', quickCapture: { keepOpen: 'yes' } })).quickCapture)
      .toEqual(defaultSettings.quickCapture);
    expect(parseStoredSettings(JSON.stringify({
      title: 'Workspace',
      quickCapture: { keepOpen: true, pinShortcut: 'Mod+Alt+K' },
    })).quickCapture).toEqual({ ...defaultSettings.quickCapture, keepOpen: true, pinShortcut: 'mod+alt+k' });
    // A shortcut Quick Hack already uses (Mod+B is bold) falls back without turning Keep open off.
    expect(parseStoredSettings(JSON.stringify({
      title: 'Workspace',
      quickCapture: { keepOpen: true, pinShortcut: 'mod+b', toggleShortcut: 'Control+Shift+Space' },
    })).quickCapture).toEqual({ keepOpen: true, pinShortcut: 'mod+shift+p', toggleShortcut: 'control+shift+space' });
    // A global hotkey without Command, Control or Alt would take keys from every app.
    expect(parseStoredSettings(JSON.stringify({
      title: 'Workspace',
      quickCapture: { keepOpen: true, toggleShortcut: 'shift+f5' },
    })).quickCapture).toEqual({ ...defaultSettings.quickCapture, keepOpen: true });
    expect(parseStoredSettings(JSON.stringify({ title: 'Workspace', quickCapture: 'on' })).quickCapture)
      .toEqual(defaultSettings.quickCapture);
  });

  it('keeps dictation off until turned on and drops a damaged dictation section', () => {
    expect(defaultSettings.dictation).toEqual({ enabled: false, locale: null });
    expect(parseStoredSettings(JSON.stringify({ title: 'Workspace', dictation: { enabled: true, locale: 'zh-TW' } })).dictation)
      .toEqual({ enabled: true, locale: 'zh-TW' });
    expect(parseStoredSettings(JSON.stringify({ title: 'Workspace', dictation: { enabled: 'yes' } })).dictation)
      .toEqual(defaultSettings.dictation);
  });

  it('keeps AI providers off unless turned on and drops a damaged AI section', () => {
    expect(defaultSettings.ai.providers.codex.enabled).toBe(false);
    expect(defaultSettings.ai.providers.claude.enabled).toBe(false);
    const stored = parseStoredSettings(JSON.stringify({
      title: 'HackDesk',
      ai: { providers: { claude: { enabled: true, model: 'haiku' } }, defaultProvider: 'claude' },
    }));
    expect(stored.ai.providers.claude).toEqual({ enabled: true, model: 'haiku', commandPath: null, ignoreApiKey: false });
    expect(stored.ai.providers.codex.enabled).toBe(false);
    expect(parseStoredSettings('{"title":"HackDesk","ai":{"defaultProvider":"gemini"}}').ai).toEqual(defaultSettings.ai);
  });

  it('keeps saved AI commands and drops only a damaged one', () => {
    const command = { id: '0b6a8f4e-2d64-4f0e-9a6c-3f1f2a1c9d10', name: 'Meeting notes', prompt: 'Turn into meeting notes', delivery: 'insert-below' };
    const stored = parseStoredSettings(JSON.stringify({
      title: 'HackDesk',
      ai: {
        providers: { claude: { enabled: true } },
        customCommands: [
          command,
          { id: '1b6a8f4e-2d64-4f0e-9a6c-3f1f2a1c9d10', name: '', prompt: 'x', delivery: 'replace' },
          { ...command, name: 'Duplicate id' },
          // Hand-edited ids that saving would reject.
          { ...command, id: 'c1', name: 'Not a UUID' },
          'junk',
        ],
      },
    }));
    expect(stored.ai.customCommands).toEqual([command]);
    // A damaged command must not reset the provider switches with it.
    expect(stored.ai.providers.claude.enabled).toBe(true);
    expect(parseSettings('{"title":"HackDesk"}').ai.customCommands).toEqual([]);
  });

  it('parses appearance settings when present', () => {
    expect(parseSettings('{"title":"Workspace","appearance":{"theme":"dark","presetId":"noctis","customSeed":{"primary":"#123ABC"}}}')).toEqual({
      title: 'Workspace',
      hackmdApiToken: '',
      hackmdAccounts: defaultSettings.hackmdAccounts,
      appearance: {
        theme: 'dark',
        presetId: 'noctis',
        customSeed: {
          primary: '#123ABC',
        },
        typography: defaultSettings.appearance.typography,
      },
      onboarding: defaultSettings.onboarding,
      localVault: defaultSettings.localVault,
      editor: defaultSettings.editor,
      shortcuts: defaultSettings.shortcuts,
      keyboardNavigation: defaultSettings.keyboardNavigation,
      workspaceNavigation: defaultSettings.workspaceNavigation,
      ai: defaultSettings.ai,
      dictation: defaultSettings.dictation,
      offline: defaultSettings.offline,
      quickCapture: defaultSettings.quickCapture,
      appIcon: defaultSettings.appIcon,
    });
  });

  it.each(['standard', 'vim', 'helix', 'emacs', 'kakoune'] as const)('parses the %s editor mode', (mode) => {
    expect(parseSettings(JSON.stringify({ title: 'Workspace', editor: { mode } })).editor).toEqual({ mode });
  });

  it('parses a stored app icon', () => {
    expect(parseSettings('{"title":"Workspace","appIcon":"nightly"}').appIcon).toBe('nightly');
  });

  it('falls back to the default app icon when the stored one no longer exists', () => {
    expect(parseSettings('{"title":"Workspace","appIcon":"retired-icon"}').appIcon).toBe(defaultSettings.appIcon);
  });

  it('rejects an unknown editor mode', () => {
    expect(() => parseSettings('{"title":"Workspace","editor":{"mode":"nano"}}')).toThrow('Invalid option');
  });

  it('parses appearance typography and mainstream presets', () => {
    expect(parseSettings(JSON.stringify({
      title: 'Workspace',
      appearance: {
        theme: 'dark',
        presetId: 'gruvbox',
        customSeed: {},
        typography: {
          uiFontStack: 'system-ui, sans-serif',
          editorFontStack: '"JetBrains Mono", ui-monospace, monospace',
          uiFontSize: 16,
          editorFontSize: 18,
        },
      },
    })).appearance).toEqual({
      theme: 'dark',
      presetId: 'gruvbox',
      customSeed: {},
      typography: {
        uiFontStack: 'system-ui, sans-serif',
        editorFontStack: '"JetBrains Mono", ui-monospace, monospace',
        uiFontSize: 16,
        editorFontSize: 18,
        // Settings saved before the toggle existed get the default.
        fontSmoothing: 'antialiased',
      },
    });

    expect(parseSettings(JSON.stringify({
      title: 'Workspace',
      appearance: {
        theme: 'dark',
        presetId: 'noctis',
        customSeed: {},
        typography: {
          uiFontStack: 'system-ui, sans-serif',
          editorFontStack: '"JetBrains Mono", ui-monospace, monospace',
          uiFontSize: 14,
          editorFontSize: 14,
        },
      },
    })).appearance.presetId).toBe('noctis');
  });

  it('fills missing font sizes from the typography defaults', () => {
    expect(parseSettings(JSON.stringify({
      title: 'Workspace',
      appearance: {
        theme: 'light',
        presetId: 'hackmd-neo',
        customSeed: {},
        typography: {
          uiFontStack: 'system-ui, sans-serif',
          editorFontStack: 'ui-monospace, monospace',
        },
      },
    })).appearance.typography).toMatchObject({
      uiFontStack: 'system-ui, sans-serif',
      editorFontStack: 'ui-monospace, monospace',
      uiFontSize: 14,
      editorFontSize: 15,
    });
  });

  it('rejects unsafe custom font stacks', () => {
    expect(() => parseSettings(JSON.stringify({
      title: 'Workspace',
      appearance: {
        theme: 'dark',
        presetId: 'hackmd-neo',
        customSeed: {},
        typography: {
          uiFontStack: 'Inter; color: red',
          editorFontStack: '"Source Code Pro", ui-monospace, monospace',
          uiFontSize: 14,
          editorFontSize: 14,
        },
      },
    }))).toThrow('Use comma-separated font family names without CSS functions or declarations.');
  });

  it.each([
    ['UI font size below the minimum', { uiFontSize: 11, editorFontSize: 14 }],
    ['UI font size above the maximum', { uiFontSize: 19, editorFontSize: 14 }],
    ['fractional UI font size', { uiFontSize: 14.5, editorFontSize: 14 }],
    ['editor font size below the minimum', { uiFontSize: 14, editorFontSize: 9 }],
    ['editor font size above the maximum', { uiFontSize: 14, editorFontSize: 33 }],
  ])('rejects %s', (_label, fontSizes) => {
    expect(() => parseSettings(JSON.stringify({
      title: 'Workspace',
      appearance: {
        theme: 'system',
        presetId: 'hackmd-neo',
        customSeed: {},
        typography: {
          uiFontStack: 'Inter, system-ui, sans-serif',
          editorFontStack: '"Source Code Pro", ui-monospace, monospace',
          ...fontSizes,
        },
      },
    }))).toThrow();
  });

  it('throws a clear error for invalid JSON', () => {
    expect(() => parseSettings('{')).toThrow('Invalid JSON format');
  });

  it('throws a validation error for invalid settings shape', () => {
    expect(() => validateSettings({ title: '' })).toThrow('Title is required');
  });

  it('parses valid shortcut overrides and rejects invalid shortcut settings', () => {
    expect(parseSettings(JSON.stringify({
      title: 'Workspace',
      shortcuts: {
        'open-command-palette': 'mod+shift+p',
        'open-quick-open': 'none',
      },
    })).shortcuts).toEqual({
      'open-command-palette': 'mod+shift+p',
      'open-quick-open': 'none',
    });

    expect(() => parseSettings(JSON.stringify({
      title: 'Workspace',
      shortcuts: {
        'not-real': 'mod+j',
      },
    }))).toThrow('Unknown shortcut action');

    expect(() => parseSettings(JSON.stringify({
      title: 'Workspace',
      shortcuts: {
        'open-command-palette': 'j',
      },
    }))).toThrow('Use a modifier-based shortcut');
  });

  it('defaults old settings to all-current-teams navigation and parses an explicit pin order', () => {
    expect(parseSettings(JSON.stringify({ title: 'Workspace' })).workspaceNavigation).toEqual({
      pinnedTeamIds: null,
    });
    expect(parseSettings(JSON.stringify({
      title: 'Workspace',
      workspaceNavigation: { pinnedTeamIds: ['team-2', 'team-1'] },
    })).workspaceNavigation).toEqual({
      pinnedTeamIds: ['team-2', 'team-1'],
    });
  });

  it('rejects duplicate pinned team IDs', () => {
    expect(() => parseSettings(JSON.stringify({
      title: 'Workspace',
      workspaceNavigation: { pinnedTeamIds: ['team-1', 'team-1'] },
    }))).toThrow('Pinned team IDs must be unique');
  });

  it('falls back to defaults and reports the error', () => {
    const onError = vi.fn();

    expect(parseSettingsOrDefault('{', defaultSettings, onError)).toEqual(defaultSettings);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid JSON format' }));
  });

  it('keeps valid stored fields when another field is invalid', () => {
    const stored = parseStoredSettings(JSON.stringify({
      title: 'Workspace',
      hackmdApiToken: 'secret-token',
      localVault: { vaults: [{ id: 'vault-1', path: '/tmp/vault' }], activeVaultId: 'vault-1' },
      editor: { mode: 'nano' },
      shortcuts: {
        'open-command-palette': 'mod+shift+p',
        'removed-action': 'mod+j',
      },
    }));
    expect(stored).toMatchObject({
      title: 'Workspace',
      hackmdApiToken: 'secret-token',
      localVault: { vaults: [{ id: 'vault-1', path: '/tmp/vault' }], activeVaultId: 'vault-1' },
      editor: defaultSettings.editor,
      shortcuts: {
        'open-command-palette': 'mod+shift+p',
      },
    });
    expect(getActiveLocalVaultPath(stored)).toBe('/tmp/vault');
  });

  it('migrates a legacy single-path vault into one active vault', () => {
    const stored = parseStoredSettings(JSON.stringify({ title: 'Workspace', localVault: { path: '/tmp/vault' } }));
    expect(stored.localVault.vaults).toHaveLength(1);
    expect(stored.localVault.vaults[0]).toMatchObject({ path: '/tmp/vault' });
    expect(stored.localVault.activeVaultId).toBe(stored.localVault.vaults[0].id);
    expect(getActiveLocalVaultPath(stored)).toBe('/tmp/vault');
    // A legacy empty path means no vault, like before.
    expect(parseStoredSettings(JSON.stringify({ title: 'Workspace', localVault: { path: '' } })).localVault)
      .toEqual(defaultLocalVaultSettings);
  });

  it('repairs damaged vault lists without losing the other vaults', () => {
    const stored = parseStoredSettings(JSON.stringify({
      title: 'Workspace',
      localVault: {
        vaults: [
          { id: 'keep', path: '/tmp/keep' },
          { id: 'keep', path: '/tmp/duplicate-id' },
          { id: 'second', path: '/tmp/duplicate-id' },
          { id: '', path: '/tmp/blank-id' },
          { id: 'no-path', path: '' },
          'junk',
        ],
        activeVaultId: 'missing',
      },
    }));
    expect(stored.localVault.vaults.map((vault) => vault.path)).toEqual(['/tmp/keep', '/tmp/duplicate-id', '/tmp/blank-id']);
    expect(stored.localVault.activeVaultId).toBe('keep');
  });

  it('normalizes stored account lists and repairs the active account', () => {
    expect(normalizeHackmdAccountsSettings({ nope: true })).toEqual(defaultHackmdAccountsSettings);
    const stored = parseStoredSettings(JSON.stringify({
      title: 'Workspace',
      hackmdAccounts: {
        accounts: [
          { id: 'one', label: '@ada' },
          { id: 'two', label: 'second' },
          { id: '', label: 'blank id' },
          'junk',
        ],
        activeAccountId: 'missing',
      },
    }));
    expect(stored.hackmdAccounts.accounts.map((account) => account.label)).toEqual(['@ada', 'second', 'blank id']);
    expect(stored.hackmdAccounts.activeAccountId).toBe('one');
    expect(getActiveHackmdAccount(stored)?.label).toBe('@ada');
  });

  it('adds, activates and forgets accounts through pure helpers', () => {
    const one = addHackmdAccount(defaultHackmdAccountsSettings, '@ada');
    expect(one.accounts).toHaveLength(1);
    expect(getActiveHackmdAccount({ hackmdAccounts: one })?.label).toBe('@ada');
    const two = addHackmdAccount(one, '  ');
    expect(two.accounts.map((account) => account.label)).toEqual(['@ada', '']);
    expect(getActiveHackmdAccount({ hackmdAccounts: two })?.label).toBe('');
    const back = setActiveHackmdAccount(two, two.accounts[0].id);
    expect(getActiveHackmdAccount({ hackmdAccounts: back })?.label).toBe('@ada');
    expect(setActiveHackmdAccount(two, 'missing')).toBe(two);
    expect(removeHackmdAccount(two, 'missing')).toBe(two);
    const forgotten = removeHackmdAccount(two, two.accounts[1].id);
    expect(forgotten.accounts).toHaveLength(1);
    expect(getActiveHackmdAccount({ hackmdAccounts: forgotten })?.label).toBe('@ada');
    expect(removeHackmdAccount(forgotten, forgotten.accounts[0].id)).toEqual(defaultHackmdAccountsSettings);
  });

  it('adds, activates and forgets vaults through pure helpers', () => {
    const one = addLocalVault(defaultLocalVaultSettings, '  /tmp/a  ');
    expect(one.vaults).toHaveLength(1);
    expect(getActiveLocalVaultPath({ localVault: one })).toBe('/tmp/a');
    const same = addLocalVault(one, '/tmp/a');
    expect(same.vaults).toHaveLength(1);
    const two = addLocalVault(one, '/tmp/b');
    expect(two.vaults.map((vault) => vault.path)).toEqual(['/tmp/a', '/tmp/b']);
    expect(getActiveLocalVaultPath({ localVault: two })).toBe('/tmp/b');
    const back = setActiveLocalVault(two, one.vaults[0].id);
    expect(getActiveLocalVaultPath({ localVault: back })).toBe('/tmp/a');
    // Unknown ids change nothing.
    expect(setActiveLocalVault(two, 'missing')).toBe(two);
    expect(removeLocalVault(two, 'missing')).toBe(two);
    const forgotten = removeLocalVault(two, two.vaults[1].id);
    expect(forgotten.vaults).toHaveLength(1);
    expect(getActiveLocalVaultPath({ localVault: forgotten })).toBe('/tmp/a');
    expect(removeLocalVault(forgotten, forgotten.activeVaultId!)).toEqual(defaultLocalVaultSettings);
  });

  it('groups known folders into named workspaces', () => {
    const two = addLocalVault(addLocalVault(defaultLocalVaultSettings, '/tmp/a'), '/tmp/b');
    const [a, b] = two.vaults;
    const created = createLocalWorkspace(two, '  Work  ', [a.id, b.id, 'missing', a.id]);
    expect(created.workspaces).toHaveLength(1);
    expect(created.workspaces[0]).toMatchObject({ name: 'Work', vaultIds: [a.id, b.id] });
    // A blank name falls back, and a set with no known folders changes nothing.
    expect(createLocalWorkspace(two, '   ', [a.id]).workspaces[0].name).toBe('Local workspace');
    expect(createLocalWorkspace(two, 'Empty', ['missing'])).toBe(two);

    const activated = setActiveLocalWorkspace(created, created.workspaces[0].id);
    expect(getActiveLocalWorkspace({ localVault: activated })?.name).toBe('Work');
    expect(getLocalWorkspaceVaults({ localVault: activated }).map((vault) => vault.path)).toEqual(['/tmp/a', '/tmp/b']);
    expect(setActiveLocalWorkspace(created, 'missing')).toBe(created);
    expect(setActiveLocalWorkspace(activated, null).activeWorkspaceId).toBeNull();

    const renamed = renameLocalWorkspace(activated, created.workspaces[0].id, 'Studio');
    expect(renamed.workspaces[0].name).toBe('Studio');
    expect(renameLocalWorkspace(activated, created.workspaces[0].id, '  ')).toBe(activated);

    const narrowed = setLocalWorkspaceVaults(renamed, renamed.workspaces[0].id, [b.id]);
    expect(narrowed.workspaces[0].vaultIds).toEqual([b.id]);
    // Removing the last folder removes the set, and with it the active workspace.
    const emptied = setLocalWorkspaceVaults(narrowed, narrowed.workspaces[0].id, []);
    expect(emptied.workspaces).toEqual([]);
    expect(emptied.activeWorkspaceId).toBeNull();

    const deleted = removeLocalWorkspace(activated, created.workspaces[0].id);
    expect(deleted.workspaces).toEqual([]);
    expect(deleted.activeWorkspaceId).toBeNull();
    expect(removeLocalWorkspace(activated, 'missing')).toBe(activated);
  });

  it('extends the active workspace when a folder is added and drops it when forgotten', () => {
    const one = addLocalVault(defaultLocalVaultSettings, '/tmp/a');
    const created = createLocalWorkspace(one, 'Work', [one.vaults[0].id]);
    const withWorkspace = setActiveLocalWorkspace(created, created.workspaces[0].id);
    const grown = addLocalVault(withWorkspace, '/tmp/b');
    expect(grown.workspaces[0].vaultIds).toEqual(grown.vaults.map((vault) => vault.id));
    expect(grown.activeVaultId).toBe(grown.vaults[1].id);

    const shrunk = removeLocalVault(grown, grown.vaults[1].id);
    expect(shrunk.workspaces[0].vaultIds).toEqual([grown.vaults[0].id]);
    const gone = removeLocalVault(shrunk, shrunk.vaults[0].id);
    expect(gone.workspaces).toEqual([]);
    expect(gone.activeWorkspaceId).toBeNull();
  });

  it('normalizes damaged workspaces instead of failing the whole section', () => {
    const normalized = normalizeLocalVaultSettings({
      vaults: [{ id: 'v1', path: '/tmp/a' }, { id: 'v2', path: '/tmp/b' }],
      activeVaultId: 'v2',
      workspaces: [
        { id: 'w1', name: '  Work  ', vaultIds: ['v1', 'v1', 'ghost', 4] },
        { id: 'w2', name: '', vaultIds: [] },
        { id: 'w1', name: 'Duplicate', vaultIds: ['v2'] },
        { id: 'w3', vaultIds: ['v2'] },
        'nope',
      ],
      activeWorkspaceId: 'w3',
    });
    expect(normalized.workspaces).toEqual([
      { id: 'w1', name: 'Work', vaultIds: ['v1'] },
      { id: 'w3', name: 'Local workspace', vaultIds: ['v2'] },
    ]);
    expect(normalized.activeWorkspaceId).toBe('w3');
    // An active id that no longer exists falls back to the single-vault view.
    expect(normalizeLocalVaultSettings({
      vaults: [{ id: 'v1', path: '/tmp/a' }],
      activeWorkspaceId: 'missing',
    }).activeWorkspaceId).toBeNull();
  });

  it('reports malformed stored JSON instead of replacing it with defaults', () => {
    expect(() => parseStoredSettings('{')).toThrow('Invalid JSON format');
  });

  it('serializes validated settings with stable formatting', () => {
    expect(serializeSettings({ ...defaultSettings, title: 'Workspace', hackmdApiToken: 'token-123' })).toBe(`{
  "title": "Workspace",
  "hackmdApiToken": "token-123",
  "hackmdAccounts": {
    "accounts": [],
    "activeAccountId": null
  },
  "appearance": {
    "theme": "system",
    "presetId": "hackmd-neo",
    "customSeed": {},
    "typography": {
      "uiFontStack": "Inter, system-ui, sans-serif",
      "editorFontStack": "Inter, system-ui, sans-serif",
      "uiFontSize": 14,
      "editorFontSize": 15,
      "fontSmoothing": "antialiased"
    }
  },
  "onboarding": {
    "hackmdTokenSetupDeferred": false
  },
  "localVault": {
    "vaults": [],
    "activeVaultId": null,
    "workspaces": [],
    "activeWorkspaceId": null
  },
  "editor": {
    "mode": "standard"
  },
  "shortcuts": {},
  "keyboardNavigation": {
    "characterShortcutsEnabled": true,
    "keyHintsVisible": true
  },
  "workspaceNavigation": {
    "pinnedTeamIds": null
  },
  "ai": {
    "providers": {
      "codex": {
        "enabled": false,
        "model": null,
        "commandPath": null,
        "ignoreApiKey": false
      },
      "claude": {
        "enabled": false,
        "model": null,
        "commandPath": null,
        "ignoreApiKey": false
      }
    },
    "defaultProvider": null,
    "selectionChip": true,
    "translateLanguage": "English",
    "customCommands": []
  },
  "dictation": {
    "enabled": false,
    "locale": null
  },
  "offline": {
    "keepHackmdNotes": true
  },
  "quickCapture": {
    "keepOpen": false,
    "pinShortcut": "mod+shift+p",
    "toggleShortcut": "control+alt+h"
  },
  "appIcon": "system"
}`);
  });
});
