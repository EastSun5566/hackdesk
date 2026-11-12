import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DocumentSummary } from '@/lib/electron-api';
import type { FolderTreeNode } from '@/lib/hackmd-folders';

import { useWorkbenchOverlays, type WorkbenchOverlayState } from './useWorkbenchOverlays';

describe('useWorkbenchOverlayState', () => {
  it('closes the top transient layer before allowing the workbench close policy to continue', () => {
    const { result } = renderHook(() => useWorkbenchOverlays());

    act(() => {
      result.current.setSettingsOpen(true);
      result.current.setPalette({ mode: 'commands', open: true, search: 'note' });
    });

    act(() => {
      expect(result.current.closeTopOverlay()).toBe(true);
    });

    expect(result.current.palette.open).toBe(false);
    expect(result.current.settingsOpen).toBe(true);

    act(() => {
      expect(result.current.closeTopOverlay()).toBe(true);
    });

    expect(result.current.settingsOpen).toBe(false);

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
describe('useWorkbenchOverlayState layers', () => {
  const note = { id: 'note-1', title: 'Note' } as DocumentSummary;
  const folder = { id: 'folder-1', name: 'Folder' } as FolderTreeNode;

  const layers: Array<{ name: string; open: (state: WorkbenchOverlayState) => void; isOpen: (state: WorkbenchOverlayState) => boolean }> = [
    {
      name: 'palette',
      open: (state) => state.setPalette({ mode: 'move-note', open: true, search: 'plan' }),
      isOpen: (state) => state.palette.open,
    },
    { name: 'share', open: (state) => state.setShareOpen(true), isOpen: (state) => state.shareOpen },
    { name: 'versions', open: (state) => state.setVersionsOpen(true), isOpen: (state) => state.versionsOpen },
    { name: 'trash', open: (state) => state.setTrashOpen(true), isOpen: (state) => state.trashOpen },
    {
      name: 'create note',
      open: (state) => state.setCreateDialog({ open: true, title: 'Plan' }),
      isOpen: (state) => state.createDialog.open,
    },
    {
      name: 'create folder',
      open: (state) => state.setCreateFolderDialog({ open: true, name: 'Specs', description: 'd', icon: 'i', color: 'c' }),
      isOpen: (state) => state.createFolderDialog.open,
    },
    { name: 'delete note', open: (state) => state.setDeleteTarget(note), isOpen: (state) => state.deleteTarget !== null },
    {
      name: 'delete folder',
      open: (state) => state.setDeleteFolderTarget(folder),
      isOpen: (state) => state.deleteFolderTarget !== null,
    },
    {
      name: 'rename folder',
      open: (state) => state.setRenameFolderDialog({ open: true, folderId: 'folder-1', name: 'Old', description: 'd', icon: 'i', color: 'c' }),
      isOpen: (state) => state.renameFolderDialog.open,
    },
    { name: 'settings', open: (state) => state.setSettingsOpen(true), isOpen: (state) => state.settingsOpen },
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

    expect(result.current.palette).toEqual({ mode: 'commands', open: false, search: '' });
    expect(result.current.createDialog).toEqual({ open: false, title: '' });
    expect(result.current.createFolderDialog).toEqual({ open: false, name: '', description: '', icon: '', color: '' });
    expect(result.current.renameFolderDialog).toEqual({
      open: false, folderId: null, name: '', description: '', icon: '', color: '',
    });
    expect(result.current.deleteTarget).toBeNull();
    expect(result.current.deleteFolderTarget).toBeNull();
    expect([result.current.settingsOpen, result.current.shareOpen, result.current.versionsOpen, result.current.trashOpen])
      .toEqual([false, false, false, false]);
  });
});
