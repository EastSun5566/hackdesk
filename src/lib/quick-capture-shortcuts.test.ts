import { describe, expect, it } from 'vitest';

import { getQuickCapturePinShortcutProblem, isValidQuickCapturePinShortcut } from './quick-capture-shortcuts';

describe('Quick Hack pin shortcut', () => {
  it('accepts the default, `none`, and shortcuts with Command, Control or Alt', () => {
    for (const config of ['mod+shift+p', 'none', 'mod+alt+k', 'ctrl+shift+space', 'alt+f2', 'mod+shift+b']) {
      expect(isValidQuickCapturePinShortcut(config)).toBe(true);
    }
  });

  it('turns away keys that would type into the note', () => {
    expect(getQuickCapturePinShortcutProblem('k')).toBe('modifier');
    expect(getQuickCapturePinShortcutProblem('shift+k')).toBe('modifier');
    expect(getQuickCapturePinShortcutProblem('f2')).toBe('modifier');
  });

  it('turns away keys the editor, the system or Quick Hack itself already uses', () => {
    expect(getQuickCapturePinShortcutProblem('mod+z')).toBe('reserved');
    expect(getQuickCapturePinShortcutProblem('mod+1')).toBe('reserved');
    expect(getQuickCapturePinShortcutProblem('mod+enter')).toBe('quick-hack');
    expect(getQuickCapturePinShortcutProblem('Mod+B')).toBe('quick-hack');
    expect(getQuickCapturePinShortcutProblem('mod+i')).toBe('quick-hack');
    // Ctrl+B is bold off macOS, where `mod` means Ctrl.
    expect(getQuickCapturePinShortcutProblem('ctrl+b')).toBe('quick-hack');
    expect(getQuickCapturePinShortcutProblem('control+alt+h')).toBe('quick-hack');
  });
});
