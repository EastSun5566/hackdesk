import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TooltipProvider } from '@/components/ui/tooltip';
import { expectMenuReturnsFocus, expectToolbarRovingFocus } from '@/test/accessibility-contracts';

import { DocumentTabs } from './DocumentTabs';
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
});
