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
    });
  });

  it('parses appearance settings when present', () => {
    expect(parseSettings('{"title":"Workspace","appearance":{"theme":"dark","presetId":"hackmd-nature","customSeed":{"primary":"#123ABC"}}}')).toEqual({
      title: 'Workspace',
      hackmdApiToken: '',
      appearance: {
        theme: 'dark',
        presetId: 'hackmd-nature',
        customSeed: {
          primary: '#123ABC',
        },
        typography: defaultSettings.appearance.typography,
      },
      onboarding: defaultSettings.onboarding,
      localVault: defaultSettings.localVault,
      editor: defaultSettings.editor,
    });
  });

  it.each(['standard', 'vim', 'helix'] as const)('parses the %s editor mode', (mode) => {
    expect(parseSettings(JSON.stringify({ title: 'Workspace', editor: { mode } })).editor).toEqual({ mode });
  });

  it('rejects an unknown editor mode', () => {
    expect(() => parseSettings('{"title":"Workspace","editor":{"mode":"emacs"}}')).toThrow('Invalid option');
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
        },
      },
    })).appearance).toEqual({
      theme: 'dark',
      presetId: 'gruvbox',
      customSeed: {},
      typography: {
        uiFontStack: 'system-ui, sans-serif',
        editorFontStack: '"JetBrains Mono", ui-monospace, monospace',
      },
    });

    expect(parseSettings(JSON.stringify({
      title: 'Workspace',
      appearance: {
        theme: 'dark',
        presetId: 'dracula',
        customSeed: {},
        typography: {
          uiFontStack: 'system-ui, sans-serif',
          editorFontStack: '"JetBrains Mono", ui-monospace, monospace',
        },
      },
    })).appearance.presetId).toBe('dracula');
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
        },
      },
    }))).toThrow('Use comma-separated font family names without CSS functions or declarations.');
  });

  it('throws a clear error for invalid JSON', () => {
    expect(() => parseSettings('{')).toThrow('Invalid JSON format');
  });

  it('throws a validation error for invalid settings shape', () => {
    expect(() => validateSettings({ title: '' })).toThrow('Title is required');
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
      "editorFontStack": "\\"Source Code Pro\\", ui-monospace, monospace"
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
  }
}`);
  });
});
