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
    });
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
  "hackmdApiToken": "token-123"
}`);
  });
});