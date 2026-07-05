import { describe, expect, it, vi } from 'vitest';

import {
  defaultSettings,
  parseSettings,
  parseSettingsOrDefault,
  serializeSettings,
  validateSettings,
} from './settings';

describe('settings helpers', () => {
  it('parses valid settings content', () => {
    expect(parseSettings('{"title":"Workspace"}')).toEqual({
      title: 'Workspace',
      hackmdApiToken: '',
      appearance: defaultSettings.appearance,
      onboarding: defaultSettings.onboarding,
      localVault: defaultSettings.localVault,
      editor: defaultSettings.editor,
      shortcuts: defaultSettings.shortcuts,
    });
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
      editorFontSize: 14,
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

  it('falls back to defaults and reports the error', () => {
    const onError = vi.fn();

    expect(parseSettingsOrDefault('{', defaultSettings, onError)).toEqual(defaultSettings);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Invalid JSON format' }));
  });

  it('serializes validated settings with stable formatting', () => {
    expect(serializeSettings({ title: 'Workspace', hackmdApiToken: 'token-123' })).toBe(`{
  "title": "Workspace",
  "hackmdApiToken": "token-123",
  "appearance": {
    "theme": "system",
    "presetId": "hackmd-neo",
    "customSeed": {},
    "typography": {
      "uiFontStack": "Inter, system-ui, sans-serif",
      "editorFontStack": "\\"Source Code Pro\\", ui-monospace, monospace",
      "uiFontSize": 14,
      "editorFontSize": 14
    }
  },
  "onboarding": {
    "hackmdTokenSetupDeferred": false
  },
  "localVault": {
    "path": null
  },
  "editor": {
    "mode": "standard"
  },
  "shortcuts": {}
}`);
  });
});
