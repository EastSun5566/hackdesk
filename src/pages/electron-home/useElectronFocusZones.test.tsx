import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useElectronFocusZones as useFocusZones } from './useElectronFocusZones';

import { useWorkbenchShortcuts } from './useWorkbenchShortcuts';
import { DEFAULT_NOTE_FINDER_STATE } from '@/lib/electron-note-finder';

function useElectronFocusZones() {
  const zones = useFocusZones();
  useWorkbenchShortcuts({ activeFinderState: DEFAULT_NOTE_FINDER_STATE, closeTransientLayer: () => false,
    handleCreateNote: vi.fn(), noteDirty: false, openPalette: vi.fn(), platform: 'darwin', refreshWorkspace: vi.fn(),
    runAction: id => id === 'focus-next-region' ? zones.focusNextZone() : id === 'focus-previous-region' ? zones.focusNextZone(true) : false,
    selectedFolderId: null, setFinderState: vi.fn(), setSelectedFolderId: vi.fn(), switchWorkspaceAtIndex: () => false });
  return zones;
}

function fixture({ navigatorCollapsed = false, details = true, rightEditor = true } = {}) {
  render(<>
    <section data-hackdesk-focus="navigator" data-hackdesk-focus-disabled={navigatorCollapsed ? 'true' : undefined}>
      <input aria-label="Search" />
      <button role="treeitem" tabIndex={0}>Tree</button>
    </section>
    <nav data-hackdesk-focus="tabs" data-document-pane-id="left"><button role="tab" tabIndex={0}>Tab</button></nav>
    <section data-document-pane-id="left" data-active-pane="false"><section data-hackdesk-focus="editor">
      <div contentEditable data-hackdesk-focus-target="true" role="textbox" aria-label="Left editor" tabIndex={0} />
    </section></section>
    <section data-document-pane-id="right" data-active-pane="true">{rightEditor && <section data-hackdesk-focus="editor">
      <div contentEditable data-hackdesk-focus-target="true" role="textbox" aria-label="Right editor" tabIndex={0} />
      {details && <aside data-hackdesk-focus="inspector"><input aria-label="Description" /></aside>}
    </section>}</section>
  </>);
  return renderHook(() => useElectronFocusZones());
}

async function cycleTo(target: HTMLElement, shiftKey = false) {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: 'F6', shiftKey });
  await waitFor(() => expect(target).toHaveFocus());
}

describe('useElectronFocusZones', () => {
  it('cycles visible regions and each editor in both directions, retaining pane identity', async () => {
    const { result } = fixture();
    const tree = screen.getByRole('treeitem');
    act(() => tree.focus());
    await cycleTo(screen.getByRole('tab'));
    await cycleTo(screen.getByRole('textbox', { name: 'Left editor' }));
    expect(result.current.focusedPaneId).toBe('left');
    await cycleTo(screen.getByRole('textbox', { name: 'Right editor' }));
    expect(result.current.focusedPaneId).toBe('right');
    await cycleTo(screen.getByRole('textbox', { name: 'Description' }));
    await cycleTo(tree);
    await cycleTo(screen.getByRole('textbox', { name: 'Description' }), true);
    await cycleTo(screen.getByRole('textbox', { name: 'Right editor' }), true);
  });

  it('skips collapsed or absent regions and restores a valid last target', async () => {
    fixture({ details: false });
    const search = screen.getByRole<HTMLInputElement>('textbox', { name: 'Search' });
    act(() => search.focus());
    await cycleTo(screen.getByRole('tab'));
    await cycleTo(search, true);
    await cycleTo(screen.getByRole('textbox', { name: 'Right editor' }), true);
    await cycleTo(search);
    search.disabled = true;
    act(() => screen.getByRole('tab').focus());
    await cycleTo(screen.getByRole('treeitem'), true);
  });

  it('resolves a direct editor request against the current active pane', async () => {
    const { result } = fixture();
    act(() => result.current.focusZone('editor'));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Right editor' })).toHaveFocus());
  });

  it('leaves focus unchanged when the active pane has no editor, while F6 can still visit the other pane', async () => {
    const { result } = fixture({ rightEditor: false });
    const tab = screen.getByRole('tab');
    act(() => tab.focus());
    await act(async () => {
      result.current.focusZone('editor');
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    expect(tab).toHaveFocus();
    await cycleTo(screen.getByRole('textbox', { name: 'Left editor' }));
  });

  it('does not leave a popup or consume modified, repeated or composing F6', async () => {
    fixture();
    const tab = screen.getByRole('tab');
    act(() => tab.focus());
    for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }, { repeat: true }]) {
      expect(fireEvent.keyDown(tab, { key: 'F6', ...modifiers })).toBe(true);
      expect(tab).toHaveFocus();
    }
    render(<section role="dialog"><input aria-label="Dialog input" /></section>);
    const input = screen.getByRole('textbox', { name: 'Dialog input' });
    act(() => input.focus());
    expect(fireEvent.keyDown(input, { key: 'F6' })).toBe(true);
    expect(input).toHaveFocus();
  });

  it('keeps F6 from a window listener, such as the notifications viewport, once it moves focus', async () => {
    fixture();
    const windowKeyDown = vi.fn();
    window.addEventListener('keydown', windowKeyDown);
    try {
      act(() => screen.getByRole('treeitem').focus());
      await cycleTo(screen.getByRole('tab'));
      expect(windowKeyDown).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', windowKeyDown);
    }
  });

  it('does not consume F6 when no regions are available', () => {
    renderHook(() => useElectronFocusZones());
    expect(fireEvent.keyDown(document.body, { key: 'F6' })).toBe(true);
  });

  it('cancels pending focus when unmounted', async () => {
    const { result, unmount } = fixture();
    const tab = screen.getByRole('tab');
    act(() => tab.focus());
    act(() => result.current.focusZone('editor'));
    unmount();
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(tab).toHaveFocus();
  });
});
