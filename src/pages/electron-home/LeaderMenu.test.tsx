import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ElectronActionContext } from '@/lib/electron-actions';
import type { ElectronActionId } from '@/lib/electron-api';
import { getLeaderLevel } from '@/lib/leader-keys';

import { LeaderMenu } from './LeaderMenu';

const actionContext = {
  editorMode: 'standard', hasToken: true, canCreate: true, scopeType: 'personal', selectedFolderId: null,
  canModifySelectedFolder: false, selectedNoteId: 'note-1', activeTabIsDraft: false, noteDirty: false, isSavingNote: false,
  openTabCount: 1, activePaneTabCount: 1, activePaneTabsToLeftCount: 0, activePaneTabsToRightCount: 0,
  navigationBackCount: 0, navigationForwardCount: 0, recentlyClosedTabCount: 0, paneCount: 1, inspectorCollapsed: true,
  navigatorCollapsed: false, workspaceRailCollapsed: false, bookOpen: false, bookContentsHidden: false, hasLocalVault: false,
  keyHintsVisible: true,
} satisfies ElectronActionContext;

function Harness({ onRun, onClose }: { onRun: (id: ElectronActionId) => void; onClose: () => void }) {
  const [path, setPath] = useState<string[] | null>([]);
  const level = path && getLeaderLevel(path, { actionContext, shortcuts: undefined, platform: 'darwin', characterShortcutsEnabled: true });
  return level ? <LeaderMenu level={level} onPathChange={setPath} onClose={() => { setPath(null); onClose(); }} onRun={onRun} /> : null;
}

function setup() {
  const onRun = vi.fn();
  const onClose = vi.fn();
  render(<><textarea aria-label="Note" /><Harness onRun={onRun} onClose={onClose} /></>);
  const note = screen.getByRole('textbox', { name: 'Note' });
  note.focus();
  return { onRun, onClose, note, press: (key: string) => fireEvent.keyDown(note, { key }) };
}

afterEach(() => { vi.useRealTimers(); });

describe('LeaderMenu', () => {
  it('opens a group with one letter and runs a command with the next, keeping focus and typing out of the note', () => {
    vi.useFakeTimers();
    const { onRun, onClose, note, press } = setup();
    expect(screen.getByRole('menu', { name: 'Commands' })).toBeVisible();

    expect(press('n')).toBe(false);
    expect(screen.getByRole('menu', { name: 'Commands › Note' })).toBeVisible();
    press('d');
    expect(onClose).toHaveBeenCalledOnce();
    vi.advanceTimersToNextFrame();
    expect(onRun).toHaveBeenCalledWith('duplicate-note');
    expect(note).toHaveFocus();
    expect(note).toHaveValue('');
  });

  it('goes back with Backspace and closes with Escape or Backspace at the top', () => {
    const { onClose, press } = setup();
    press('t');
    press('Backspace');
    expect(screen.getByRole('menu', { name: 'Commands' })).toBeVisible();
    press('Backspace');
    expect(onClose).toHaveBeenCalledOnce();

    cleanup();
    const second = setup();
    second.press('Escape');
    expect(second.onClose).toHaveBeenCalledOnce();
  });

  it('explains instead of running an unavailable command or an unknown letter, and stays open', () => {
    const { onRun, press } = setup();
    press('n');
    press('s');
    expect(screen.getByRole('status')).toHaveTextContent('No unsaved note changes.');
    press('z');
    expect(screen.getByRole('status')).toHaveTextContent('Z is not a command here.');
    press(' ');
    expect(screen.getByRole('status')).toHaveTextContent('Z is not a command here.');
    expect(onRun).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeVisible();
  });

  it('runs a command when its row is clicked, and closes on a click outside', () => {
    vi.useFakeTimers();
    const { onRun, onClose } = setup();
    fireEvent.click(screen.getByRole('menuitem', { name: /Command Palette/ }));
    vi.advanceTimersToNextFrame();
    expect(onRun).toHaveBeenCalledWith('open-command-palette');

    expect(onClose).toHaveBeenCalledOnce();
    cleanup();
    const second = setup();
    fireEvent.pointerDown(second.note);
    expect(second.onClose).toHaveBeenCalledOnce();
  });
});
