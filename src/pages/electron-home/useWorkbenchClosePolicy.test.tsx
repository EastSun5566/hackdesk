import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { HackDeskElectronAPI } from '@/lib/electron-api';

import type { OpenNoteTab } from './note-workspace';
import { useWorkbenchClosePolicy, type WorkbenchClosePolicyOptions } from './useWorkbenchClosePolicy';

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

function createApi() {
  return {
    app: {
      cancelClose: vi.fn(async () => undefined),
      confirmClose: vi.fn(async () => undefined),
      onCloseRequest: vi.fn(() => () => undefined),
    },
  } as unknown as HackDeskElectronAPI;
}

function createOptions(overrides: Partial<WorkbenchClosePolicyOptions> = {}): WorkbenchClosePolicyOptions {
  const activeTab = createTab();

  return {
    api: createApi(),
    closeTransientLayer: vi.fn(() => false),
    confirmCloseUnsafeTabs: vi.fn(async () => true),
    openTabs: {
      [activeTab.tabId]: activeTab,
    },
    ...overrides,
  };
}

describe('useWorkbenchClosePolicy', () => {
  it('cancels window close when any unsafe tab is rejected', async () => {
    const options = createOptions({
      confirmCloseUnsafeTabs: vi.fn(async () => false),
    });
    const { result } = renderHook(() => useWorkbenchClosePolicy(options));

    await act(async () => {
      await result.current.settleCloseRequest({ source: 'window-button' });
    });

    expect(options.confirmCloseUnsafeTabs).toHaveBeenCalledWith(
      Object.values(options.openTabs),
      'Close HackDesk',
      'Close',
    );
    expect(options.api?.app.cancelClose).toHaveBeenCalledOnce();
    expect(options.api?.app.confirmClose).not.toHaveBeenCalled();
  });

  it('lets a clean window close request continue after unsafe tabs are accepted', async () => {
    const options = createOptions();
    const { result } = renderHook(() => useWorkbenchClosePolicy(options));

    await act(async () => {
      await result.current.settleCloseRequest({ source: 'window-button' });
    });

    expect(options.confirmCloseUnsafeTabs).toHaveBeenCalledOnce();
    expect(options.api?.app.confirmClose).toHaveBeenCalledOnce();
    expect(options.api?.app.cancelClose).not.toHaveBeenCalled();
  });

  it('closes transient layers before considering tabs or the window', async () => {
    const options = createOptions({
      closeTransientLayer: vi.fn(() => true),
    });
    const { result } = renderHook(() => useWorkbenchClosePolicy(options));

    await act(async () => {
      await result.current.settleCloseRequest({ source: 'window-button' });
    });

    expect(options.closeTransientLayer).toHaveBeenCalledOnce();
    expect(options.confirmCloseUnsafeTabs).not.toHaveBeenCalled();
    expect(options.api?.app.cancelClose).toHaveBeenCalledOnce();
  });

  it('does not let a transient layer cancel Cmd+Q', async () => {
    const options = createOptions({ closeTransientLayer: vi.fn(() => true) });
    const { result } = renderHook(() => useWorkbenchClosePolicy(options));

    await act(async () => {
      await result.current.settleCloseRequest({ source: 'app-quit' });
    });

    expect(options.closeTransientLayer).not.toHaveBeenCalled();
    expect(options.api?.app.confirmClose).toHaveBeenCalledOnce();
  });
});
