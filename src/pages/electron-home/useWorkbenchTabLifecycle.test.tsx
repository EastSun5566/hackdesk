import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { HackDeskElectronAPI, NoteSummary } from '@/lib/electron-api';
import type { FolderTreeNote } from '@/lib/hackmd-folders';

import type { DocumentSyncState } from './DocumentDetail';
import type { NotePane, OpenNoteTab } from './note-workspace';
import { useWorkbenchTabLifecycle, type WorkbenchTabLifecycleOptions } from './useWorkbenchTabLifecycle';

function createTab(overrides: Partial<OpenNoteTab> = {}): OpenNoteTab {
  return {
    noteId: 'note-1',
    shortId: 'short-1',
    tabId: 'tab-1',
    teamPath: null,
    title: 'Test note',
    updatedAtMillis: null,
    ...overrides,
  };
}

function createNote(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    content: null,
    createdAtMillis: null,
    description: '',
    folderPaths: [],
    id: 'note-next',
    lastChangeUser: null,
    permalink: null,
    publishLink: 'https://hackmd.io/note-next',
    publishedAtMillis: null,
    publishType: 'edit',
    readPermission: 'owner',
    shortId: 'note-next',
    tags: [],
    tagsUpdatedAtMillis: null,
    teamPath: null,
    title: 'Next note',
    titleUpdatedAtMillis: null,
    updatedAtMillis: null,
    userPath: null,
    writePermission: 'owner',
    ...overrides,
  };
}

function createApi(confirmed: boolean) {
  return {
    app: {
      confirm: vi.fn(async () => ({ confirmed })),
    },
  } as unknown as HackDeskElectronAPI;
}

function createVisibleEntry(note = createNote()): FolderTreeNote {
  return {
    folderLabel: 'Root',
    folderPath: [],
    note,
  };
}

function createOptions(overrides: Partial<WorkbenchTabLifecycleOptions> = {}): WorkbenchTabLifecycleOptions {
  const firstTab = createTab({ tabId: 'tab-1', title: 'One' });
  const secondTab = createTab({ noteId: 'note-2', shortId: 'short-2', tabId: 'tab-2', title: 'Two' });
  const pane: NotePane = {
    activeTabId: firstTab.tabId,
    paneId: 'pane-1',
    size: 100,
    tabIds: [firstTab.tabId, secondTab.tabId],
  };

  return {
    activePaneId: pane.paneId,
    api: createApi(true),
    autoSelectSuppressionRef: { current: null },
    closeOtherTabs: vi.fn(),
    closeTab: vi.fn(),
    closeTabsToRight: vi.fn(),
    focusEditor: vi.fn(),
    getAutoSelectSuppressionKey: vi.fn(() => 'suppressed-next'),
    getTabSyncState: vi.fn((): DocumentSyncState => 'saved'),
    getTabTitle: vi.fn((tab: OpenNoteTab) => tab.title),
    isTabDirty: vi.fn(() => false),
    manualEmptyWorkspaceRef: { current: false },
    panes: [pane],
    selectTab: vi.fn(),
    tabs: {
      [firstTab.tabId]: firstTab,
      [secondTab.tabId]: secondTab,
    },
    visibleEntries: [createVisibleEntry()],
    ...overrides,
  };
}

describe('useWorkbenchTabLifecycle', () => {
  it('closes a clean tab without confirmation', async () => {
    const options = createOptions();
    const { result } = renderHook(() => useWorkbenchTabLifecycle(options));

    await act(async () => {
      expect(await result.current.requestCloseTab('tab-1')).toBe(true);
    });

    expect(options.api?.app.confirm).not.toHaveBeenCalled();
    expect(options.closeTab).toHaveBeenCalledWith('tab-1');
  });

  it('keeps a dirty tab open when close confirmation is canceled', async () => {
    const options = createOptions({
      api: createApi(false),
      isTabDirty: vi.fn((tab: OpenNoteTab) => tab.tabId === 'tab-1'),
    });
    const { result } = renderHook(() => useWorkbenchTabLifecycle(options));

    await act(async () => {
      expect(await result.current.requestCloseTab('tab-1')).toBe(false);
    });

    expect(options.api?.app.confirm).toHaveBeenCalledOnce();
    expect(options.closeTab).not.toHaveBeenCalled();
  });

  it('closes a dirty tab after confirmation', async () => {
    const options = createOptions({
      isTabDirty: vi.fn((tab: OpenNoteTab) => tab.tabId === 'tab-1'),
    });
    const { result } = renderHook(() => useWorkbenchTabLifecycle(options));

    await act(async () => {
      expect(await result.current.requestCloseTab('tab-1')).toBe(true);
    });

    expect(options.api?.app.confirm).toHaveBeenCalledOnce();
    expect(options.closeTab).toHaveBeenCalledWith('tab-1');
  });

  it('includes save failed inactive tabs in close confirmation', async () => {
    const options = createOptions({
      api: createApi(false),
      getTabSyncState: vi.fn((tab: OpenNoteTab): DocumentSyncState => (tab.tabId === 'tab-2' ? 'save_failed' : 'saved')),
    });
    const { result } = renderHook(() => useWorkbenchTabLifecycle(options));

    await act(async () => {
      expect(await result.current.confirmCloseUnsafeTabs(Object.values(options.tabs), 'Close HackDesk', 'Close')).toBe(false);
    });

    expect(options.api?.app.confirm).toHaveBeenCalledOnce();
    expect(options.api?.app.confirm).toHaveBeenCalledWith(expect.objectContaining({
      detail: '1 note has a failed save. Closing will discard drafts that have not been saved.',
    }));
    expect(options.closeTab).not.toHaveBeenCalled();
  });

  it('closes other tabs and tabs to the right in the target pane only after confirmation', async () => {
    const options = createOptions({
      isTabDirty: vi.fn((tab: OpenNoteTab) => tab.tabId === 'tab-2'),
    });
    const { result } = renderHook(() => useWorkbenchTabLifecycle(options));

    await act(async () => {
      await result.current.requestCloseOtherTabs('pane-1', 'tab-1');
      await result.current.requestCloseTabsToRight('pane-1', 'tab-1');
    });

    expect(options.api?.app.confirm).toHaveBeenCalledTimes(2);
    expect(options.closeOtherTabs).toHaveBeenCalledWith('pane-1', 'tab-1');
    expect(options.closeTabsToRight).toHaveBeenCalledWith('pane-1', 'tab-1');
  });

  it('focuses the requested tab index and the last tab index', () => {
    const options = createOptions();
    const { result } = renderHook(() => useWorkbenchTabLifecycle(options));

    expect(result.current.focusTabAtIndex(0)).toBe(true);
    expect(result.current.focusTabAtIndex(-1)).toBe(true);

    expect(options.selectTab).toHaveBeenNthCalledWith(1, 'pane-1', 'tab-1');
    expect(options.selectTab).toHaveBeenNthCalledWith(2, 'pane-1', 'tab-2');
    expect(options.focusEditor).toHaveBeenCalledTimes(2);
  });
});
