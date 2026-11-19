import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { DEFAULT_NOTE_FINDER_STATE } from '@/lib/electron-note-finder';
import type { FolderPathSummary, NoteSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree, UNFILED_FOLDER_ID } from '@/lib/hackmd-folders';
import { TooltipProvider } from '@/components/ui/tooltip';

import { FolderNavigator, type FolderNavigatorProps } from './FolderNavigator';
import { TREE_ROW_PITCH_PX } from './LazyTreeChildren';
import { createOverlayWrapper } from './test-overlays';
import { WorkspaceNavigationProvider } from './WorkspaceNavigationContext';

const ROW_SELECTOR = '[data-folder-tree-row-id]';
const PENDING_SELECTOR = '[data-tree-pending-children]';
const pendingHeight = (placeholder: HTMLElement) => parseFloat(placeholder.style.getPropertyValue('--tree-pending-height'));

/** 30 folders, each with 3 subfolders of 8 notes and 4 notes of its own: 1,050 rows when all open. */
function buildLargeTree() {
  const folders: FolderPathSummary[] = [];
  const notes: NoteSummary[] = [];
  const addFolder = (id: string, parentId: string | null) => {
    const folder = { clientId: null, color: null, icon: null, id, name: id, parentId };
    folders.push(folder);
    return folder;
  };
  const addNotes = (path: FolderPathSummary[], prefix: string, count: number) => {
    for (let index = 0; index < count; index += 1) {
      const id = `${prefix}-note-${index}`;
      notes.push({
        content: null, createdAtMillis: null, description: '', folderPaths: path, id, lastChangeUser: null,
        permalink: null, publishLink: `https://hackmd.io/${id}`, publishedAtMillis: null, publishType: 'edit',
        readPermission: 'owner', shortId: id, tags: [], tagsUpdatedAtMillis: null, teamPath: null, title: id,
        titleUpdatedAtMillis: null, updatedAtMillis: null, userPath: null, writePermission: 'owner',
      });
    }
  };
  for (let top = 0; top < 30; top += 1) {
    const parent = addFolder(`folder-${String(top).padStart(2, '0')}`, null);
    for (let sub = 0; sub < 3; sub += 1) {
      const child = addFolder(`${parent.id}-${sub}`, parent.id);
      addNotes([parent, child], child.id, 8);
    }
    addNotes([parent], parent.id, 4);
  }
  return buildHackmdFolderTree(notes, folders);
}

/**
 * jsdom has no layout. This lays the tree out as the app does, one row per 34px, in a window as
 * tall as jsdom's: a not yet built folder is as tall as the rows it stands for.
 */
function stubTreeLayout() {
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this === document.documentElement) return new DOMRect(0, 0, 1024, window.innerHeight);
    if (!this.matches(PENDING_SELECTOR)) return original.call(this);
    let rows = 0;
    for (const element of document.querySelectorAll<HTMLElement>(`${ROW_SELECTOR}, ${PENDING_SELECTOR}`)) {
      if (element === this) break;
      if (element.closest('[hidden]')) continue;
      rows += element.matches(PENDING_SELECTOR) ? pendingHeight(element) / TREE_ROW_PITCH_PX : 1;
    }
    return new DOMRect(0, rows * TREE_ROW_PITCH_PX, 280, pendingHeight(this));
  });
}

/** Placeholders observed for scrolling into view, and a way to scroll one there. */
const observed = new Map<Element, IntersectionObserverCallback>();
class IntersectionObserverStub {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(element: Element) { observed.set(element, this.callback); }
  disconnect() { for (const [element, callback] of observed) if (callback === this.callback) observed.delete(element); }
  unobserve(element: Element) { observed.delete(element); }
  takeRecords() { return []; }
}
function scrollIntoReach(element: Element) {
  const callback = observed.get(element);
  expect(callback).toBeDefined();
  act(() => callback?.([{ isIntersecting: true, target: element } as unknown as IntersectionObserverEntry], {} as IntersectionObserver));
}

function renderLargeNavigator({ expanded = false, selectedNoteId = null }: { expanded?: boolean; selectedNoteId?: string | null } = {}) {
  const tree = buildLargeTree();
  const noop = vi.fn();
  const actions = new Proxy({}, { get: () => noop }) as FolderNavigatorProps['actions'];
  function Harness() {
    // By default every folder starts closed, as in a workspace never expanded.
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(expanded ? [] : tree.nodesById.keys()));
    return (
      <FolderNavigator
        entries={tree.allNotes}
        emptyState={{ description: '', title: '' }}
        finderState={DEFAULT_NOTE_FINDER_STATE}
        id="large-tree"
        layout={{ collapsed: false, collapsedFolderIds: collapsed, width: 320 }}
        actions={{
          ...actions,
          onExpandAllFolders: () => setCollapsed(new Set()),
          onCollapseAllFolders: () => setCollapsed(new Set(tree.nodesById.keys())),
        }}
        scope={{ label: 'Personal', type: 'personal' }}
        selection={{ selectedFolderId: UNFILED_FOLDER_ID, selectedNoteId }}
        status={{
          activeError: null, canCreate: true, hasLocalVault: true, hasToken: true, isCreating: false, isFetching: false,
          isLoading: false, isMovingFolder: false, isMovingNote: false, showingCachedFallback: false,
        }}
        tree={tree}
      />
    );
  }
  const overlays = createOverlayWrapper();
  const navigation = {
    platform: 'darwin' as const, pinnedTeamIds: null, onPinnedTeamIdsChange: noop, scope: { type: 'personal' as const, label: 'My Workspace' },
    teams: [], localVaults: [], onChooseLocalVault: noop, onSwitchLocalVault: noop, onScopeChange: noop, onOpenSettings: noop,
  };
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <overlays.wrapper>
        <WorkspaceNavigationProvider value={navigation}>
          <TooltipProvider><Harness /></TooltipProvider>
        </WorkspaceNavigationProvider>
      </overlays.wrapper>
    </QueryClientProvider>,
  );
  const clickToggleAll = (label: 'Expand all folders' | 'Collapse all folders') => {
    act(() => { fireEvent.click(view.container.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!); });
  };
  return { ...view, tree, clickToggleAll };
}

const rowIds = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>(ROW_SELECTOR), (row) => row.dataset.folderTreeRowId);

describe('FolderNavigator on a large tree', () => {
  beforeEach(() => {
    stubTreeLayout();
    vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    observed.clear();
  });

  it('expands all folders by building only the rows near the view', () => {
    const { container, clickToggleAll } = renderLargeNavigator();
    expect(container.querySelectorAll(ROW_SELECTOR)).toHaveLength(31);

    clickToggleAll('Expand all folders');
    // 1,050 rows are open, but only those within reach of the 768px view are built: the rest wait
    // in placeholders as tall as the rows they stand for.
    const built = container.querySelectorAll(ROW_SELECTOR).length;
    expect(built).toBeGreaterThan(30);
    expect(built).toBeLessThan(150);
    const pending = Array.from(container.querySelectorAll<HTMLElement>(PENDING_SELECTOR));
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((placeholder) => pendingHeight(placeholder) > 0)).toBe(true);
    expect(rowIds(container)).toContain('note:folder-00-0-note-0');
    expect(rowIds(container)).not.toContain('note:folder-29-2-note-7');

    // Collapsing leaves the built rows hidden, not rebuilt or removed, and drops the placeholders.
    clickToggleAll('Collapse all folders');
    expect(container.querySelectorAll(ROW_SELECTOR)).toHaveLength(built);
    expect(container.querySelectorAll(PENDING_SELECTOR)).toHaveLength(0);
  });

  it('builds a waiting folder as it scrolls near the view', () => {
    const { container, clickToggleAll } = renderLargeNavigator();
    clickToggleAll('Expand all folders');
    const last = container.querySelector<HTMLElement>(`${PENDING_SELECTOR}[data-tree-pending-children="folder-29"]`);
    expect(last).not.toBeNull();

    scrollIntoReach(last!);
    expect(container.querySelector('[data-tree-pending-children="folder-29"]')).toBeNull();
    expect(rowIds(container)).toContain('folder:folder-29-2');
    // Its subfolders' rows come in with it once they are near the view too.
    const nested = container.querySelector<HTMLElement>('[data-tree-pending-children="folder-29-2"]');
    if (nested) scrollIntoReach(nested);
    expect(rowIds(container)).toContain('note:folder-29-2-note-7');
  });

  it('builds the rows the keyboard moves to, however far down the tree', async () => {
    const { container, clickToggleAll } = renderLargeNavigator();
    clickToggleAll('Expand all folders');
    const first = container.querySelector<HTMLElement>('[data-folder-tree-row-id="folder:folder-00"] [role="treeitem"]')!;
    act(() => first.focus());

    fireEvent.keyDown(first, { key: 'End' });
    await vi.waitFor(() => {
      expect(document.activeElement?.closest(ROW_SELECTOR)?.getAttribute('data-folder-tree-row-id')).toBe('note:folder-29-note-3');
    });
  });

  it('builds and scrolls to the open note when it sits far down the tree', async () => {
    const scrollIntoView = vi.mocked(HTMLElement.prototype.scrollIntoView);
    scrollIntoView.mockClear();
    const { container } = renderLargeNavigator({ expanded: true, selectedNoteId: 'folder-29-2-note-7' });

    await vi.waitFor(() => {
      const row = container.querySelector('[data-folder-tree-row-id="note:folder-29-2-note-7"]');
      expect(row).not.toBeNull();
      expect(scrollIntoView.mock.contexts).toContain(row);
    });
  });
});
