import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ElectronActionContext } from '@/lib/electron-actions';

import { KeyHintBar } from './KeyHintBar';

const actionContext = {
  canCreate: true, hasToken: true, scopeType: 'personal', selectedNoteId: 'note-1', noteDirty: false,
  openTabCount: 1, paneCount: 1, activePaneTabCount: 1, activePaneTabsToLeftCount: 0, activePaneTabsToRightCount: 0,
  selectedFolderId: null, canModifySelectedFolder: false, inspectorCollapsed: true, navigatorCollapsed: false,
} as unknown as ElectronActionContext;

function setup(onOpenShortcuts = vi.fn()) {
  render(
    <>
      <div data-hackdesk-focus="navigator">
        <input name="noteSearch" aria-label="Search notes" />
        <button type="button" role="treeitem">Plan</button>
      </div>
      <div data-hackdesk-focus="editor"><div className="cm-editor"><div role="textbox" tabIndex={0} aria-label="Note" /></div></div>
      <KeyHintBar actionContext={actionContext} shortcuts={undefined} platform="darwin" characterShortcutsEnabled onOpenShortcuts={onOpenShortcuts} />
    </>,
  );
  return { bar: screen.getByRole('note', { name: 'Keys you can press' }), onOpenShortcuts };
}

afterEach(() => { vi.useRealTimers(); });

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

  it('fades with the rest of the workbench while the page is marked as writing', () => {
    const { bar } = setup();
    expect(bar.className).toContain('[html[data-writing]_&]:opacity-0');
  });

  it('opens Keyboard Shortcuts from its ? button', () => {
    const { onOpenShortcuts } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Shortcuts/ }));
    expect(onOpenShortcuts).toHaveBeenCalledOnce();
  });
});
