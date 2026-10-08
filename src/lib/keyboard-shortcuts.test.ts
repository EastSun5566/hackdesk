import { describe, expect, it } from 'vitest';
import { getResolvedActionShortcut, resolveWorkbenchShortcut } from './electron-actions';
import { getShortcutConflicts, isValidCustomShortcutConfig, matchShortcutConfig } from './keyboard-shortcuts';

describe('resolved workbench shortcuts', () => {
  it('matches produced punctuation independently of Shift, without allowing modifiers', () => {
    expect(matchShortcutConfig('?', new KeyboardEvent('keydown', { key: '?', shiftKey: true }), 'darwin')).toBe(true);
    expect(matchShortcutConfig('?', new KeyboardEvent('keydown', { key: '?', metaKey: true }), 'darwin')).toBe(false);
    expect(matchShortcutConfig('/', new KeyboardEvent('keydown', { key: '/' }), 'darwin')).toBe(true);
  });
  it('replaces every tab alias and suppresses hints when disabled', () => {
    expect(getResolvedActionShortcut('focus-next-tab', undefined, 'darwin')).toContain('⌃Tab');
    expect(resolveWorkbenchShortcut('focus-next-tab', { 'focus-next-tab': 'mod+j' })).toBe('mod+j');
    expect(getResolvedActionShortcut('focus-next-tab', { 'focus-next-tab': 'none' }, 'darwin')).toBeUndefined();
    expect(getResolvedActionShortcut('rename-folder', undefined, 'darwin')).toBeUndefined();
  });
  it('disables only built-in character keys, retaining custom help/search keys', () => {
    expect(getResolvedActionShortcut('search-notes', undefined, 'darwin', false)).toBeUndefined();
    expect(getResolvedActionShortcut('show-keyboard-shortcuts', { 'show-keyboard-shortcuts': 'mod+j' }, 'darwin', false)).toBe('⌘J');
    expect(getResolvedActionShortcut('focus-next-region', undefined, 'darwin', false)).toBe('F6');
  });
  it.each(['mod+1', 'cmd+9', 'ctrl+2'])('reserves workspace binding %s', config => {
    expect(isValidCustomShortcutConfig(config)).toBe(false);
  });
  it('detects conflicts with default tab aliases', () => {
    expect(getShortcutConflicts('show-keyboard-shortcuts', 'ctrl+tab', { 'focus-next-tab': 'mod+alt+arrowright,ctrl+tab' }, { 'focus-next-tab': 'Next Tab' }, 'darwin')).toEqual(['Next Tab']);
  });
});
