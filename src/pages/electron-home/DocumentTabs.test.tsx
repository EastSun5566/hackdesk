import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

function createDocumentTabsProps(overrides: Partial<Parameters<typeof DocumentTabs>[0]> = {}) {
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
    onReorderTab: vi.fn(),
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

  return props;
}

function renderDocumentTabs(overrides: Partial<Parameters<typeof DocumentTabs>[0]> = {}) {
  const props = createDocumentTabsProps(overrides);

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

    expect(screen.getByRole('tab', { name: 'Select Daily Notes tab' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Project Plan' })).toBeInTheDocument();
    await expectToolbarRovingFocus('Pane controls', ['Pane actions']);
  });

  it('exposes manual-activation tabs with one tab stop and announced sync status', () => {
    renderDocumentTabs({ paneId: 'pane-1' });
    const list = screen.getByRole('tablist', { name: 'Open documents' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(tabs.filter(tab => tab.tabIndex === 0)).toEqual([tabs[0]]);
    expect(tabs[0]).toHaveAttribute('aria-controls', 'document-pane-pane-1');
    expect(tabs[0]).toHaveAccessibleDescription('Saved');
  });

  it('keeps empty document navigation named without visible placeholder copy', () => {
    renderDocumentTabs({
      activeTab: null,
      tabs: [],
    });

    const openDocuments = screen.getByRole('navigation', { name: 'Open documents' });
    expect(openDocuments).toBeEmptyDOMElement();
    expect(within(openDocuments).queryByRole('list')).not.toBeInTheDocument();
    expect(within(openDocuments).queryByRole('tab', { name: /Select .* tab/ })).not.toBeInTheDocument();
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
      expect(screen.getByText(label).closest('[role="tab"]')).toHaveAccessibleDescription(label);
      expect(document.querySelector(`[data-sync-state="${state}"]`)).toHaveAttribute('aria-hidden', 'true');
    }

    fireEvent.mouseEnter(document.querySelector('[data-sync-state="saving"]')!);
    expect(await screen.findAllByText('Saving…')).toHaveLength(2);
  });

  it('gives dirty and failed tabs a non-color-only status shape', () => {
    renderDocumentTabs({
      getTabSyncState: vi.fn((currentTab: OpenNoteTab): DocumentSyncState => (
        currentTab.tabId === 'tab-1' ? 'idle' : 'save_failed'
      )),
    });

    expect(document.querySelector('[data-sync-state="idle"]')).toHaveClass(
      'before:size-1',
      'before:rounded-full',
    );
    expect(document.querySelector('[data-sync-state="save_failed"]')).toHaveClass(
      'before:rotate-45',
      'after:-rotate-45',
    );
  });

  it('keeps select and close tab payloads unchanged', () => {
    const props = renderDocumentTabs();

    fireEvent.click(screen.getByRole('tab', { name: 'Select Project Plan tab' }));
    expect(props.onSelectTab).toHaveBeenCalledWith('tab-2');

    fireEvent.click(screen.getByRole('button', { name: 'Close Project Plan' }));
    expect(props.onCloseTab).toHaveBeenCalledWith('tab-2');
  });

  it('scrolls the active tab into view when selection changes', () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    try {
      const props = createDocumentTabsProps();
      const secondTab = props.tabs[1]!;

      const { rerender } = render(
        <TooltipProvider delayDuration={0}>
          <DocumentTabs {...props} />
        </TooltipProvider>,
      );

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });

      rerender(
        <TooltipProvider delayDuration={0}>
          <DocumentTabs {...props} activeTab={secondTab} />
        </TooltipProvider>,
      );

      expect(scrollIntoView).toHaveBeenCalledTimes(2);
    } finally {
      if (originalScrollIntoView) {
        HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
      }
    }
  });

  it('moves focus with arrows and Home/End without selecting or reordering', () => {
    const props = renderDocumentTabs();
    const first = screen.getByRole('tab', { name: 'Select Daily Notes tab' });
    const second = screen.getByRole('tab', { name: 'Select Project Plan tab' });
    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('tabindex', '0');
    expect(first).toHaveAttribute('tabindex', '-1');
    expect(first).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(second, { key: 'Home' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'End' });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: 'ArrowRight' });
    expect(first).toHaveFocus();
    expect(props.onSelectTab).not.toHaveBeenCalled();
    expect(props.onReorderTab).not.toHaveBeenCalled();
    fireEvent.click(second, { detail: 0 });
    expect(props.onSelectTab).toHaveBeenCalledWith('tab-2');
  });

  it('recovers a removed close button focus to a neighbor, then pane actions', () => {
    const props = createDocumentTabsProps();
    const { rerender } = render(<TooltipProvider><DocumentTabs {...props} /></TooltipProvider>);
    act(() => screen.getByRole('button', { name: 'Close Daily Notes' }).focus());
    fireEvent.click(document.activeElement!);
    expect(props.onCloseTab).toHaveBeenCalledWith('tab-1');
    rerender(<TooltipProvider><DocumentTabs {...props} activeTab={props.tabs[1]} tabs={[props.tabs[1]]} /></TooltipProvider>);
    expect(screen.getByRole('tab', { name: 'Select Project Plan tab' })).toHaveFocus();
    rerender(<TooltipProvider><DocumentTabs {...props} activeTab={null} tabs={[]} /></TooltipProvider>);
    expect(screen.getByRole('button', { name: 'Pane actions' })).toHaveFocus();
  });

  it('does not steal external focus when a tab disappears', () => {
    const props = createDocumentTabsProps();
    const view = (tabs: OpenNoteTab[]) => <TooltipProvider><input aria-label="Outside" /><DocumentTabs {...props} tabs={tabs} /></TooltipProvider>;
    const { rerender } = render(view(props.tabs));
    act(() => screen.getByRole('tab', { name: 'Select Daily Notes tab' }).focus());
    act(() => screen.getByRole('textbox', { name: 'Outside' }).focus());
    rerender(view([props.tabs[1]]));
    expect(screen.getByRole('textbox', { name: 'Outside' })).toHaveFocus();
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

  it.each([
    ['first', 'Move Tab Right', 'tab-1', 'tab-2', 'Move Tab Left'],
    ['last', 'Move Tab Left', 'tab-2', 'tab-1', 'Move Tab Right'],
  ])('reorders the %s tab through accessible pane actions', async (position, action, from, to, disabled) => {
    const props = renderDocumentTabs({ activeTab: position === 'first' ? tab() : tab({ tabId: 'tab-2', title: 'Project Plan' }) });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Pane actions' }));
    expect(await screen.findByRole('menuitem', { name: disabled })).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(screen.getByRole('menuitem', { name: action }));
    expect(props.onReorderTab).toHaveBeenCalledWith(from, to);
    expect(props.onSelectTab).not.toHaveBeenCalled();
    expect(props.onCloseTab).not.toHaveBeenCalled();
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
