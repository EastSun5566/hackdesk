import { describe, expect, it, vi } from 'vitest';

import {
  addLocalVault,
  defaultLocalVaultSettings,
  defaultSettings,
  getActiveLocalVaultPath,
  parseSettings,
  parseSettingsOrDefault,
  parseStoredSettings,
  removeLocalVault,
  serializeSettings,
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
    });
  });
  it('keeps opened HackMD notes offline by default and drops a damaged offline section', () => {
    expect(defaultSettings.offline).toEqual({ keepHackmdNotes: true });
    expect(parseStoredSettings(JSON.stringify({ title: 'Workspace', offline: { keepHackmdNotes: false } })).offline)
      .toEqual({ keepHackmdNotes: false });
    expect(parseStoredSettings(JSON.stringify({ title: 'Workspace', offline: { keepHackmdNotes: 'no' } })).offline)
      .toEqual(defaultSettings.offline);
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
    });
  });

  it.each(['standard', 'vim', 'helix', 'emacs', 'kakoune'] as const)('parses the %s editor mode', (mode) => {
    expect(parseSettings(JSON.stringify({ title: 'Workspace', editor: { mode } })).editor).toEqual({ mode });
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

  it('reports malformed stored JSON instead of replacing it with defaults', () => {
    expect(() => parseStoredSettings('{')).toThrow('Invalid JSON format');
  });

  it('serializes validated settings with stable formatting', () => {
    expect(serializeSettings({ ...defaultSettings, title: 'Workspace', hackmdApiToken: 'token-123' })).toBe(`{
  "title": "Workspace",
  "hackmdApiToken": "token-123",
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
    "activeVaultId": null
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
  }
}`);
  });
});
