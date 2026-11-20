import { describe, expect, it } from 'vitest';

import { toGlobalShortcutAccelerator } from './keyboard-shortcuts';
import {
  getQuickCapturePinShortcutProblem,
  getQuickCaptureToggleShortcutProblem,
  isValidQuickCapturePinShortcut,
  isValidQuickCaptureToggleShortcut,
  recordGlobalShortcutFromEvent,
} from './quick-capture-shortcuts';

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

  it('turns away keys the editor, the system or the global hotkey already uses', () => {
    expect(getQuickCapturePinShortcutProblem('mod+z')).toBe('reserved');
    expect(getQuickCapturePinShortcutProblem('mod+1')).toBe('reserved');
    expect(getQuickCapturePinShortcutProblem('mod+enter')).toBe('quick-hack');
    expect(getQuickCapturePinShortcutProblem('Mod+B')).toBe('quick-hack');
    expect(getQuickCapturePinShortcutProblem('mod+i')).toBe('quick-hack');
    // Ctrl+B is bold off macOS, where `mod` means Ctrl.
    expect(getQuickCapturePinShortcutProblem('ctrl+b')).toBe('quick-hack');
    expect(getQuickCapturePinShortcutProblem('control+alt+h', 'control+alt+h')).toBe('other');
    expect(getQuickCapturePinShortcutProblem('control+alt+h', 'control+shift+space')).toBeNull();
  });
});

describe('Quick Hack global hotkey', () => {
  it('accepts the default, `none`, and keys a global hotkey can name', () => {
    for (const config of ['control+alt+h', 'none', 'mod+shift+space', 'ctrl+alt+f12', 'mod+alt+arrowup', 'control+alt+comma', 'mod+ctrl+k']) {
      expect(isValidQuickCaptureToggleShortcut(config)).toBe(true);
    }
  });

  it('turns away keys that would take typing from every app, or that it cannot name', () => {
    expect(getQuickCaptureToggleShortcutProblem('shift+f5')).toBe('modifier');
    expect(getQuickCaptureToggleShortcutProblem('h')).toBe('modifier');
    expect(getQuickCaptureToggleShortcutProblem('mod+c')).toBe('reserved');
    expect(getQuickCaptureToggleShortcutProblem('control+alt+˙')).toBe('key');
    expect(getQuickCaptureToggleShortcutProblem('mod+i')).toBe('quick-hack');
    expect(getQuickCaptureToggleShortcutProblem('mod+shift+p', 'mod+shift+p')).toBe('other');
  });

  it('becomes an Electron accelerator for the platform', () => {
    expect(toGlobalShortcutAccelerator('control+alt+h', 'darwin')).toBe('Control+Alt+H');
    expect(toGlobalShortcutAccelerator('mod+ctrl+k', 'darwin')).toBe('Command+Control+K');
    expect(toGlobalShortcutAccelerator('mod+shift+space', 'win32')).toBe('Control+Shift+Space');
    expect(toGlobalShortcutAccelerator('control+alt+comma', 'linux')).toBe('Control+Alt+,');
    expect(toGlobalShortcutAccelerator('none', 'darwin')).toBeUndefined();
  });

  it('records the physical key when Shift or Option changes the character', () => {
    const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);
    expect(recordGlobalShortcutFromEvent(press({ key: '˙', code: 'KeyH', ctrlKey: true, altKey: true }), 'darwin'))
      .toBe('ctrl+alt+h');
    expect(recordGlobalShortcutFromEvent(press({ key: '¡', code: 'Digit1', metaKey: true, altKey: true }), 'darwin'))
      .toBe('mod+alt+1');
    expect(recordGlobalShortcutFromEvent(press({ key: 'K', code: 'KeyK', metaKey: true, shiftKey: true }), 'darwin'))
      .toBe('mod+shift+k');
    expect(recordGlobalShortcutFromEvent(press({ key: '(', code: 'Digit9', ctrlKey: true, shiftKey: true }), 'win32'))
      .toBe('mod+shift+9');
  });
});
