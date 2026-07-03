import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { expectMenuReturnsFocus, expectToolbarRovingFocus } from '@/test/accessibility-contracts';

import { DocumentTabs } from './DocumentTabs';
import type { DocumentSyncState } from './document-sync-state';
import type { OpenNoteTab } from './note-workspace';

function tab(overrides: Partial<OpenNoteTab> = {}): OpenNoteTab {
  return {
    noteId: 'note-1',
    shortId: 'short-1',
    tabId: 'tab-1',
    teamPath: null,
    title: 'Daily Notes',
    updatedAtMillis: null,
    ...overrides,
  };
}

function renderDocumentTabs(overrides: Partial<Parameters<typeof DocumentTabs>[0]> = {}) {
  const firstTab = tab();
  const props: Parameters<typeof DocumentTabs>[0] = {
    activeTab: firstTab,
    canMoveToOtherPane: true,
    canReopenLastClosedTab: true,
    canSplit: true,
    getTabSyncState: vi.fn(() => 'saved'),
    onCloseOtherTabs: vi.fn(),
    onCloseTab: vi.fn(),
    onCloseTabsToRight: vi.fn(),
    onMoveTabToOtherPane: vi.fn(),
    onReopenLastClosedTab: vi.fn(),
    onSelectTab: vi.fn(),
    onSplitPane: vi.fn(),
    tabs: [
      firstTab,
      tab({
        noteId: 'note-2',
        shortId: 'short-2',
        tabId: 'tab-2',
        title: 'Project Plan',
      }),
    ],
    ...overrides,
  };

  render(
    <TooltipProvider delayDuration={0}>
      <DocumentTabs {...props} />
    </TooltipProvider>,
  );

  return props;
}

describe('DocumentTabs', () => {
  it('keeps note tabs custom while pane actions use toolbar roving focus', async () => {
    renderDocumentTabs();

    expect(screen.getByRole('button', { name: 'Select Daily Notes tab' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Project Plan' })).toBeInTheDocument();
    await expectToolbarRovingFocus('Pane controls', ['Pane actions']);
  });

  it('uses the shared sync status labels for tab status accessibility', async () => {
    const states: DocumentSyncState[] = ['idle', 'loading', 'saving', 'saved', 'cached', 'save_failed', 'conflict'];
    renderDocumentTabs({
      activeTab: tab({
        noteId: 'idle',
        shortId: 'idle',
        tabId: 'idle',
        title: 'Idle note',
      }),
      getTabSyncState: vi.fn((currentTab: OpenNoteTab) => currentTab.noteId as DocumentSyncState),
      tabs: states.map((state) => tab({
        noteId: state,
        shortId: state,
        tabId: state,
        title: `${state} note`,
      })),
    });

    const expectedLabels: Array<[DocumentSyncState, string]> = [
      ['idle', 'Unsaved'],
      ['loading', 'Loading…'],
      ['saving', 'Saving…'],
      ['saved', 'Saved'],
      ['cached', 'Cached'],
      ['save_failed', 'Save failed'],
      ['conflict', 'Conflict'],
    ];

    for (const [state, label] of expectedLabels) {
      expect(screen.getByLabelText(label)).toHaveAttribute('data-sync-state', state);
    }

    fireEvent.mouseEnter(screen.getByLabelText('Saving…'));
    expect(await screen.findByText('Saving…')).toBeInTheDocument();
  });

  it('gives dirty and failed tabs a non-color-only status shape', () => {
    renderDocumentTabs({
      getTabSyncState: vi.fn((currentTab: OpenNoteTab): DocumentSyncState => (
        currentTab.tabId === 'tab-1' ? 'idle' : 'save_failed'
      )),
    });

    expect(screen.getByLabelText('Unsaved')).toHaveClass(
      'before:size-1',
      'before:rounded-full',
    );
    expect(screen.getByLabelText('Save failed')).toHaveClass(
      'before:rotate-45',
      'after:-rotate-45',
    );
  });

  it('keeps select and close tab payloads unchanged', () => {
    const props = renderDocumentTabs();

    fireEvent.click(screen.getByRole('button', { name: 'Select Project Plan tab' }));
    expect(props.onSelectTab).toHaveBeenCalledWith('tab-2');

    fireEvent.click(screen.getByRole('button', { name: 'Close Project Plan' }));
    expect(props.onCloseTab).toHaveBeenCalledWith('tab-2');
  });

  it('returns focus to pane actions after Escape closes the menu', async () => {
    renderDocumentTabs();

    const trigger = screen.getByRole('button', { name: 'Pane actions' });
    await expectMenuReturnsFocus(trigger, (menu) => {
      fireEvent.keyDown(menu, { key: 'Escape' });
    });
  });

  it('returns focus to pane actions after running a menu item', async () => {
    const props = renderDocumentTabs();

    const trigger = screen.getByRole('button', { name: 'Pane actions' });
    await expectMenuReturnsFocus(trigger, async () => {
      fireEvent.click(await screen.findByText('Split Right'));
    });

    expect(props.onSplitPane).toHaveBeenCalledOnce();
  });

  it('does not run disabled pane actions', async () => {
    const props = renderDocumentTabs({
      canMoveToOtherPane: false,
      canReopenLastClosedTab: false,
      canSplit: false,
      tabs: [tab()],
    });

    const trigger = screen.getByRole('button', { name: 'Pane actions' });
    fireEvent.pointerDown(trigger);

    const disabledItems = [
      await screen.findByRole('menuitem', { name: 'Split Right' }),
      screen.getByRole('menuitem', { name: 'Move Tab to Other Pane' }),
      screen.getByRole('menuitem', { name: 'Close Other Tabs' }),
      screen.getByRole('menuitem', { name: 'Close Tabs to Right' }),
      screen.getByRole('menuitem', { name: 'Reopen Last Closed Tab' }),
    ];

    for (const item of disabledItems) {
      expect(item).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(item);
    }

    expect(props.onSplitPane).not.toHaveBeenCalled();
    expect(props.onMoveTabToOtherPane).not.toHaveBeenCalled();
    expect(props.onCloseOtherTabs).not.toHaveBeenCalled();
    expect(props.onCloseTabsToRight).not.toHaveBeenCalled();
    expect(props.onReopenLastClosedTab).not.toHaveBeenCalled();
  });
});
