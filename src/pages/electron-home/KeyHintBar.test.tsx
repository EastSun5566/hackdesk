import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ElectronActionContext } from '@/lib/electron-actions';
import type { ShortcutOverrides } from '@/lib/keyboard-shortcuts';

import { publishEditorStatus, clearEditorStatus } from '@/lib/editor-status-store';

import { KeyHintBar } from './KeyHintBar';

const actionContext = {
  canCreate: true, hasToken: true, scopeType: 'personal', selectedNoteId: 'note-1', noteDirty: false,
  openTabCount: 1, paneCount: 1, activePaneTabCount: 1, activePaneTabsToLeftCount: 0, activePaneTabsToRightCount: 0,
  selectedFolderId: null, canModifySelectedFolder: false, inspectorCollapsed: true, navigatorCollapsed: false,
} as unknown as ElectronActionContext;

function setup({ shortcuts, characterShortcutsEnabled = true, platform = 'darwin', splitStatusLine = false, ...rest }: {
  shortcuts?: ShortcutOverrides;
  characterShortcutsEnabled?: boolean;
  platform?: string;
  splitStatusLine?: boolean;
  sidebarWidth?: number;
  navigatorCollapsed?: boolean;
  keyHintsVisible?: boolean;
} = {}) {
  const onOpenShortcuts = vi.fn();
  render(
    <>
      <div data-hackdesk-focus="navigator">
        <input name="noteSearch" aria-label="Search notes" />
        <button type="button" role="treeitem">Plan</button>
      </div>
      <div data-hackdesk-focus="editor"><div className="cm-editor"><div role="textbox" tabIndex={0} aria-label="Note" /></div></div>
      <KeyHintBar
        actionContext={actionContext}
        shortcuts={shortcuts}
        platform={platform}
        characterShortcutsEnabled={characterShortcutsEnabled}
        onOpenShortcuts={onOpenShortcuts}
        splitStatusLine={splitStatusLine}
        {...rest}
      />
    </>,
  );
  return { bar: screen.getByRole('note', { name: 'Keys you can press' }), onOpenShortcuts };
}

afterEach(() => {
  vi.useRealTimers();
  clearEditorStatus();
});

describe('KeyHintBar', () => {
  it('shows the keys for where focus is, and follows it', () => {
    const { bar } = setup();
    act(() => screen.getByRole('treeitem').focus());
    expect(bar).toHaveTextContent('Open');
    expect(bar).toHaveTextContent('New note');

    act(() => screen.getByRole('textbox', { name: 'Search notes' }).focus());
    expect(bar).toHaveTextContent('Filter notes');

    act(() => screen.getByRole('textbox', { name: 'Note' }).focus());
    expect(bar).toHaveTextContent('Open note');
    expect(bar).not.toHaveTextContent('New note');
  });

  it('fades while typing in a note, and returns on a pause, the pointer, or a modifier', () => {
    vi.useFakeTimers();
    const { bar } = setup();
    const note = screen.getByRole('textbox', { name: 'Note' });
    act(() => note.focus());

    fireEvent.keyDown(note, { key: 'a' });
    expect(bar).toHaveClass('opacity-0');
    act(() => { vi.advanceTimersByTime(1500); });
    expect(bar).not.toHaveClass('opacity-0');

    fireEvent.keyDown(note, { key: 'b' });
    fireEvent.pointerMove(document);
    expect(bar).not.toHaveClass('opacity-0');

    fireEvent.keyDown(note, { key: 'c' });
    fireEvent.keyDown(note, { key: 'Meta', metaKey: true });
    expect(bar).not.toHaveClass('opacity-0');
  });

  it('keeps showing while keys move around outside a note', () => {
    const { bar } = setup();
    const row = screen.getByRole('treeitem');
    act(() => row.focus());
    fireEvent.keyDown(row, { key: 'ArrowDown' });
    expect(bar).not.toHaveClass('opacity-0');
  });

  it('shows the default ? shortcut and opens Keyboard Shortcuts', () => {
    const { onOpenShortcuts } = setup();
    const button = screen.getByRole('button', { name: /Shortcuts/ });
    expect(button.querySelector('kbd')).toHaveTextContent('?');
    fireEvent.click(button);
    expect(onOpenShortcuts).toHaveBeenCalledOnce();
  });

  it('in split mode keeps fixed hint text and only shifts emphasis on focus', () => {
    const { bar } = setup({ splitStatusLine: true, sidebarWidth: 280 });
    publishEditorStatus({
      active: true,
      editorMode: 'vim',
      vimMode: 'NORMAL',
      kakouneMode: null,
      line: 1,
      column: 1,
      wordCount: 3,
    });
    act(() => screen.getByRole('treeitem').focus());
    const left = screen.getByTestId('key-hint-half-left');
    const right = screen.getByTestId('key-hint-half-right');
    expect(left).toHaveTextContent('Open');
    expect(left).not.toHaveClass('opacity-50');
    expect(right).toHaveTextContent('Find');
    expect(right).toHaveClass('opacity-50');
    const leftBefore = left.textContent;

    act(() => screen.getByRole('textbox', { name: 'Note' }).focus());
    expect(bar).toHaveAttribute('data-status-emphasis', 'right');
    expect(left).toHaveTextContent('Open');
    expect(left.textContent).toBe(leftBefore);
    expect(left).toHaveClass('opacity-50');
    expect(right).not.toHaveClass('opacity-50');
  });

  it('in split mode hides the left half when the sidebar is collapsed', () => {
    setup({ splitStatusLine: true, sidebarWidth: 280, navigatorCollapsed: true });
    expect(screen.queryByTestId('key-hint-half-left')).toBeNull();
    expect(screen.getByTestId('key-hint-half-right')).toBeTruthy();
  });

  it('with the experiment off matches the classic swapping bar', () => {
    const { bar } = setup({ splitStatusLine: false });
    expect(bar).not.toHaveAttribute('data-split-status-line');
    act(() => screen.getByRole('treeitem').focus());
    expect(bar).toHaveTextContent('New note');
    act(() => screen.getByRole('textbox', { name: 'Note' }).focus());
    expect(bar).toHaveTextContent('Open note');
    expect(bar).not.toHaveTextContent('New note');
  });

  it.each([
    { name: 'custom macOS binding', shortcuts: { 'show-keyboard-shortcuts': 'mod+shift+h' }, platform: 'darwin', characterShortcutsEnabled: true, expected: '⇧⌘H' },
    { name: 'custom Windows binding', shortcuts: { 'show-keyboard-shortcuts': 'mod+shift+h' }, platform: 'win32', characterShortcutsEnabled: true, expected: 'Ctrl+Shift+H' },
    { name: 'disabled binding', shortcuts: { 'show-keyboard-shortcuts': 'none' }, characterShortcutsEnabled: true, expected: undefined },
    { name: 'character shortcuts off', shortcuts: undefined, characterShortcutsEnabled: false, expected: undefined },
    { name: 'custom binding with character shortcuts off', shortcuts: { 'show-keyboard-shortcuts': 'mod+shift+h' }, characterShortcutsEnabled: false, expected: '⇧⌘H' },
  ])('keeps the button usable with $name', ({ expected, ...options }) => {
    const { onOpenShortcuts } = setup(options);
    const button = screen.getByRole('button', { name: /Shortcuts/ });
    const badge = button.querySelector('kbd');
    if (expected) expect(badge).toHaveTextContent(expected);
    else expect(badge).toBeNull();
    fireEvent.click(button);
    expect(onOpenShortcuts).toHaveBeenCalledOnce();
  });
});
