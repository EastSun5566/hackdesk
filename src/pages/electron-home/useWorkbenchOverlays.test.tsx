import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DocumentSummary } from '@/lib/electron-api';
import type { FolderTreeNode } from '@/lib/hackmd-folders';

import { useWorkbenchOverlays } from './useWorkbenchOverlays';

type WorkbenchOverlayState = ReturnType<typeof useWorkbenchOverlays>;

describe('useWorkbenchOverlays', () => {
  it('closes the top transient layer before allowing the workbench close policy to continue', () => {
    const { result } = renderHook(() => useWorkbenchOverlays());

    act(() => {
      result.current.controls.openSettings();
      result.current.controls.set('palette', { mode: 'commands', open: true, search: 'note' });
    });

    act(() => {
      expect(result.current.closeTopOverlay()).toBe(true);
    });

    expect(result.current.overlays.palette.open).toBe(false);
    expect(result.current.overlays.settings.open).toBe(true);

    act(() => {
      expect(result.current.closeTopOverlay()).toBe(true);
    });

    expect(result.current.overlays.settings.open).toBe(false);

    act(() => {
      expect(result.current.closeTopOverlay()).toBe(false);
    });
  });
});

/**
 * Characterization of the overlay state before it moves into one model (#362 step 3): every layer
 * can be open at the same time, Escape and window close take them down in a fixed priority (not in
 * the order they opened), and each one is reset to its closed value.
 */
describe('useWorkbenchOverlays layers', () => {
  const note = { id: 'note-1', title: 'Note' } as DocumentSummary;
  const folder = { id: 'folder-1', name: 'Folder' } as FolderTreeNode;

  const layers: Array<{ name: string; open: (state: WorkbenchOverlayState) => void; isOpen: (state: WorkbenchOverlayState) => boolean }> = [
    {
      name: 'palette',
      open: (state) => state.controls.set('palette', { mode: 'move-note', open: true, search: 'plan' }),
      isOpen: (state) => state.overlays.palette.open,
    },
    { name: 'share', open: (state) => state.controls.set('share', true), isOpen: (state) => state.overlays.share },
    { name: 'versions', open: (state) => state.controls.set('versions', true), isOpen: (state) => state.overlays.versions },
    { name: 'trash', open: (state) => state.controls.set('trash', true), isOpen: (state) => state.overlays.trash },
    {
      name: 'create note',
      open: (state) => state.controls.set('createNote', { open: true, title: 'Plan' }),
      isOpen: (state) => state.overlays.createNote.open,
    },
    {
      name: 'create folder',
      open: (state) => state.controls.set('createFolder', { open: true, name: 'Specs', description: 'd', icon: 'i', color: 'c' }),
      isOpen: (state) => state.overlays.createFolder.open,
    },
    { name: 'delete note', open: (state) => state.controls.set('deleteNote', note), isOpen: (state) => state.overlays.deleteNote !== null },
    {
      name: 'delete folder',
      open: (state) => state.controls.set('deleteFolder', folder),
      isOpen: (state) => state.overlays.deleteFolder !== null,
    },
    {
      name: 'rename folder',
      open: (state) => state.controls.set('renameFolder', { open: true, folderId: 'folder-1', name: 'Old', description: 'd', icon: 'i', color: 'c' }),
      isOpen: (state) => state.overlays.renameFolder.open,
    },
    { name: 'settings', open: (state) => state.controls.openSettings(), isOpen: (state) => state.overlays.settings.open },
  ];

  const openNames = (state: WorkbenchOverlayState) => layers.filter((layer) => layer.isOpen(state)).map((layer) => layer.name);

  it('closes one layer at a time in a fixed priority, whatever order they opened in', () => {
    const { result } = renderHook(() => useWorkbenchOverlays());
    // Open them in reverse priority, so closing by recency would give the opposite order.
    act(() => {
      for (const layer of [...layers].reverse()) layer.open(result.current);
    });
    expect(openNames(result.current)).toEqual(layers.map((layer) => layer.name));

    const closed: string[] = [];
    for (;;) {
      const before = openNames(result.current);
      let handled = false;
      act(() => {
        handled = result.current.closeTopOverlay();
      });
      if (!handled) break;
      const after = openNames(result.current);
      expect(after).toHaveLength(before.length - 1);
      closed.push(before.find((name) => !after.includes(name))!);
    }

    expect(closed).toEqual([
      'palette',
      'share',
      'versions',
      'trash',
      'create note',
      'create folder',
      'delete note',
      'delete folder',
      'rename folder',
      'settings',
    ]);
  });

  it('resets each layer to its closed value', () => {
    const { result } = renderHook(() => useWorkbenchOverlays());
    act(() => {
      for (const layer of layers) layer.open(result.current);
    });
    for (let index = 0; index < layers.length; index += 1) {
      act(() => {
        result.current.closeTopOverlay();
      });
    }

    expect(result.current.overlays.palette).toEqual({ mode: 'commands', open: false, search: '' });
    expect(result.current.overlays.createNote).toEqual({ open: false, title: '' });
    expect(result.current.overlays.createFolder).toEqual({ open: false, name: '', description: '', icon: '', color: '' });
    expect(result.current.overlays.renameFolder).toEqual({
      open: false, folderId: null, name: '', description: '', icon: '', color: '',
    });
    expect(result.current.overlays.deleteNote).toBeNull();
    expect(result.current.overlays.deleteFolder).toBeNull();
    expect([result.current.overlays.settings.open, result.current.overlays.share, result.current.overlays.versions, result.current.overlays.trash])
      .toEqual([false, false, false, false]);
  });
});
