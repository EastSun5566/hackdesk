import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentSummary } from '@/lib/electron-api';

import {
  PaneDocumentActions,
  useDocumentActions,
  useWorkbenchDocumentActions,
  WorkbenchDocumentActionsProvider,
  type WorkbenchDocumentActions,
} from './DocumentActionsContext';
import type { OpenNoteTab } from './note-workspace';
import { createOverlayWrapper } from './test-overlays';

/** What the workbench builds on each render: new callbacks every time. */
function workbenchActions(overrides: Partial<WorkbenchDocumentActions> = {}): WorkbenchDocumentActions {
  return {
    onOpenEditor: vi.fn(),
    onOpenExternal: vi.fn(),
    onRevealInFinder: vi.fn(),
    onCopyLink: vi.fn(),
    onCopyMarkdownLink: vi.fn(),
    onExportMarkdown: vi.fn(),
    onReloadFromDisk: vi.fn(),
    onReloadFromHackmd: vi.fn(),
    onSave: vi.fn(),
    onSaveAsCopy: vi.fn(),
    onSaveMetadata: vi.fn(),
    onSaveSharing: vi.fn(),
    onAttachImage: vi.fn(async () => undefined),
    onDelete: vi.fn(),
    onTitleChange: vi.fn(),
    onContentChange: vi.fn(),
    onToggleInspector: vi.fn(),
    onCopyDraft: vi.fn(),
    onExportDraft: vi.fn(),
    onOpenAsNewDraft: vi.fn(),
    onRetryLoad: vi.fn(),
    ...overrides,
  };
}

const TAB: OpenNoteTab = { tabId: 'tab-1', noteId: 'note-1', shortId: 'short-1', teamPath: null, title: 'Plan', updatedAtMillis: null };

/** Renders `hook` under the workbench provider whose value `rerender(next)` replaces, as the workbench does. */
function renderUnderWorkbench<T>(hook: () => T, initial: WorkbenchDocumentActions, pane?: { tab: OpenNoteTab | null; paneId: string }) {
  const holder = { value: initial };
  const overlays = createOverlayWrapper();
  const view = renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <overlays.wrapper>
        <WorkbenchDocumentActionsProvider value={holder.value}>
          {pane ? <PaneDocumentActions tab={pane.tab} paneId={pane.paneId}>{children}</PaneDocumentActions> : children}
        </WorkbenchDocumentActionsProvider>
      </overlays.wrapper>
    ),
  });
  return {
    result: view.result,
    overlayStore: overlays.store,
    rerender: (next: WorkbenchDocumentActions) => {
      holder.value = next;
      view.rerender();
    },
  };
}

describe('WorkbenchDocumentActionsProvider', () => {
  it('keeps its value while the workbench re-renders with new callbacks, calling the latest ones', () => {
    const { result, rerender } = renderUnderWorkbench(() => useWorkbenchDocumentActions(), workbenchActions());
    const first = result.current;

    const latest = workbenchActions();
    rerender(latest);
    expect(result.current).toBe(first);

    const note = { id: 'note-1' } as DocumentSummary;
    first.onDelete(note);
    expect(latest.onDelete).toHaveBeenCalledWith(note);
  });

  it('offers an optional action only while the workbench does', () => {
    const { result, rerender } = renderUnderWorkbench(() => useWorkbenchDocumentActions(), workbenchActions());
    expect(result.current.onPresent).toBeUndefined();

    const onPresent = vi.fn();
    rerender(workbenchActions({ onPresent }));
    result.current.onPresent?.({ title: 'Deck', content: '# Slide' });
    expect(onPresent).toHaveBeenCalledWith({ title: 'Deck', content: '# Slide' });

    rerender(workbenchActions({ onPresent: undefined }));
    expect(result.current.onPresent).toBeUndefined();
  });
});

describe('PaneDocumentActions', () => {
  it('acts on the tab and pane it is given', async () => {
    const workbench = workbenchActions({ onCancelImageUpload: vi.fn() });
    const { result } = renderUnderWorkbench(() => useDocumentActions(), workbench, { tab: TAB, paneId: 'pane-b' });

    result.current.onSave({ content: 'Body' }, { successMessage: 'Saved.' });
    expect(workbench.onSave).toHaveBeenCalledWith(TAB, { content: 'Body' }, { successMessage: 'Saved.' });
    result.current.onTitleChange('Renamed');
    expect(workbench.onTitleChange).toHaveBeenCalledWith(TAB, 'Renamed');
    result.current.onContentChange('Edited');
    expect(workbench.onContentChange).toHaveBeenCalledWith(TAB, 'Edited');
    const file = new File(['png'], 'image.png');
    await result.current.onAttachImage(file, '![Uploading]()');
    expect(workbench.onAttachImage).toHaveBeenCalledWith(TAB, file, '![Uploading]()');
    result.current.onCancelImageUpload?.();
    expect(workbench.onCancelImageUpload).toHaveBeenCalledWith(TAB);
    result.current.onOpenAsNewDraft('Plan', 'Draft body');
    expect(workbench.onOpenAsNewDraft).toHaveBeenCalledWith('Plan', 'Draft body', 'pane-b');
  });

  it('does nothing to a tab while the pane has none', async () => {
    const workbench = workbenchActions();
    const { result } = renderUnderWorkbench(() => useDocumentActions(), workbench, { tab: null, paneId: 'pane-a' });
    result.current.onSave({ content: 'Body' });
    result.current.onContentChange('Edited');
    await result.current.onAttachImage(new File([], 'empty.png'), '');
    expect(workbench.onSave).not.toHaveBeenCalled();
    expect(workbench.onContentChange).not.toHaveBeenCalled();
    expect(workbench.onAttachImage).not.toHaveBeenCalled();
  });

  it('opens Share and Versions as workbench overlays', () => {
    const { result, overlayStore } = renderUnderWorkbench(() => useDocumentActions(), workbenchActions(), { tab: TAB, paneId: 'pane-a' });
    result.current.onShareOpenChange(true);
    expect(overlayStore.getState().share).toBe(true);
    result.current.onVersionsOpenChange?.(true);
    expect(overlayStore.getState().versions).toBe(true);
  });

  it('keeps its actions while the workbench re-renders with the same tab', () => {
    const { result, rerender } = renderUnderWorkbench(() => useDocumentActions(), workbenchActions(), { tab: TAB, paneId: 'pane-a' });
    const first = result.current;
    rerender(workbenchActions());
    expect(result.current).toBe(first);
  });

  it('asks for a pane when read outside one', () => {
    expect(() => renderHook(() => useDocumentActions())).toThrow('PaneDocumentActions');
  });
});
