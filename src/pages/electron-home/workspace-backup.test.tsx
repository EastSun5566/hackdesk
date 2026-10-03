import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HackDeskElectronAPI, NoteSummary } from '@/lib/electron-api';
import { readRecentNotes } from '@/lib/electron-recent-notes';

import { readNoteWorkspaceLayoutStorage } from './note-workspace';
import { useElectronHomeRecentNotes } from './useElectronHomeRecentNotes';
import { useNoteWorkspaceTabs } from './useNoteWorkspaceTabs';
import { useWorkbenchClosePolicy } from './useWorkbenchClosePolicy';
import { useWorkspaceBackupNotice } from './useWorkspaceBackupNotice';
import { WorkspaceBackupNotice } from './WorkspaceBackupNotice';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ toast }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
  toast.success.mockClear();
  toast.error.mockClear();
});

function failWrites() {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  });
}

function makeStorageUnavailable() {
  const unavailable = () => { throw new DOMException('Storage is unavailable.', 'SecurityError'); };
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(unavailable);
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(unavailable);
}

const savedDraft = (scopeKey: string, tabId: string) => readNoteWorkspaceLayoutStorage(localStorage, scopeKey).drafts[tabId];

describe('workspace backup failures', () => {
  it.each([
    ['quota', failWrites],
    ['unavailable storage', makeStorageUnavailable],
  ])('keeps newer drafts in memory through %s failures while editing, switching and returning', (_, breakStorage) => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(useNoteWorkspaceTabs, { initialProps: 'A' });
    act(() => { result.current.openDraftNote({ title: 'A', content: 'Backed up' }); });
    act(() => { vi.advanceTimersByTime(250); });
    const tabId = result.current.activeTab!.tabId;
    expect(savedDraft('A', tabId).content).toBe('Backed up');

    const storage = breakStorage();
    act(() => { result.current.updateDraft(tabId, { title: 'A', content: 'Only in memory' }); });
    expect(() => act(() => { vi.advanceTimersByTime(250); })).not.toThrow();
    expect(result.current.backupFailed).toBe(true);
    expect(result.current.state.drafts[tabId].content).toBe('Only in memory');

    expect(() => rerender('B')).not.toThrow();
    expect(result.current.state.scopeKey).toBe('B');
    expect(result.current.backupFailedInOtherWorkspace).toBe(true);
    expect(result.current.backupFailedInCurrentWorkspace).toBe(false);
    rerender('A');
    expect(result.current.backupFailedInCurrentWorkspace).toBe(true);
    // The older disk backup must not replace the newer in-memory draft.
    expect(result.current.state.drafts[tabId].content).toBe('Only in memory');

    storage.mockRestore();
    vi.restoreAllMocks();
    expect(savedDraft('A', tabId).content).toBe('Backed up');
    act(() => { expect(result.current.retryBackup()).toBe(true); });
    expect(result.current.backupFailed).toBe(false);
    expect(savedDraft('A', tabId).content).toBe('Only in memory');
  });

  it('reports and retries an inactive workspace whose delayed completion cannot be written', () => {
    const { result, rerender } = renderHook(useNoteWorkspaceTabs, { initialProps: 'A' });
    act(() => { result.current.openDraftNote({ title: 'Submitted', content: 'Body' }); });
    const tabId = result.current.activeTab!.tabId;
    const origin = result.current;
    rerender('B');
    const storage = failWrites();
    const note = { id: 'saved', shortId: 'saved', title: 'Submitted', content: 'Body', teamPath: null, updatedAtMillis: 2 } as NoteSummary;
    expect(() => act(() => { origin.materializeDraftNote(tabId, note, { title: 'Submitted', content: 'Body' }); })).not.toThrow();
    expect(result.current.state.scopeKey).toBe('B');
    expect(result.current.backupFailed).toBe(true);
    expect(result.current.backupFailedInOtherWorkspace).toBe(true);
    expect(readNoteWorkspaceLayoutStorage(localStorage, 'A').tabs[tabId]).not.toMatchObject({ noteId: 'saved' });

    act(() => { expect(result.current.retryBackup()).toBe(false); });
    expect(result.current.backupFailed).toBe(true);
    storage.mockRestore();
    act(() => { expect(result.current.retryBackup()).toBe(true); });
    expect(result.current.backupFailed).toBe(false);
    expect(readNoteWorkspaceLayoutStorage(localStorage, 'A').tabs[tabId]).toMatchObject({ noteId: 'saved' });
  });

  it('does not throw from pagehide or unmount, and restart only restores what was backed up', () => {
    const { result, unmount } = renderHook(useNoteWorkspaceTabs, { initialProps: 'A' });
    act(() => { result.current.openRecoverableDraftNote({ content: 'Backed up' }); });
    const tabId = result.current.activeTab!.tabId;
    failWrites();
    act(() => { result.current.updateDraft(tabId, { title: '', content: 'Lost on restart' }); });
    expect(() => window.dispatchEvent(new Event('pagehide'))).not.toThrow();
    expect(() => unmount()).not.toThrow();
    vi.restoreAllMocks();

    const restarted = renderHook(useNoteWorkspaceTabs, { initialProps: 'A' });
    // The existing backup is kept, not deleted to make room.
    expect(restarted.result.current.state.drafts[tabId].content).toBe('Backed up');
    expect(restarted.result.current.backupFailed).toBe(false);
  });

  it('rejects a Quick Hack draft that cannot be backed up and leaves the workspace unchanged', () => {
    const { result } = renderHook(useNoteWorkspaceTabs, { initialProps: 'A' });
    act(() => { result.current.openRecoverableDraftNote({ content: 'Existing' }); });
    const before = result.current.state;
    const stored = localStorage.getItem('hackdesk_note_workspace:A');
    failWrites();
    expect(() => result.current.openRecoverableDraftNote({ content: 'Keep in popup' })).toThrow('Your text is still here');
    expect(result.current.state).toBe(before);
    expect(result.current.backupFailed).toBe(false);
    vi.restoreAllMocks();
    expect(localStorage.getItem('hackdesk_note_workspace:A')).toBe(stored);
  });

  it('keeps recent notes in memory when they cannot be written', () => {
    const { result } = renderHook(() => useElectronHomeRecentNotes(localStorage, null));
    failWrites();
    const note = { id: 'n1', title: 'Recent', shortId: 'n1', teamPath: null } as NoteSummary;
    expect(() => act(() => { result.current.trackRecentNote(note); })).not.toThrow();
    expect(result.current.recentNotes.map((recent) => recent.noteId)).toEqual(['n1']);
    vi.restoreAllMocks();
    expect(readRecentNotes(localStorage)).toEqual([]);
  });
});

describe('workspace backup notice', () => {
  function createApi() {
    return {
      app: {
        writeClipboardText: vi.fn(async () => undefined),
        saveTextFile: vi.fn(async () => '/tmp/draft.md'),
        confirm: vi.fn(async () => ({ confirmed: false })),
        cancelClose: vi.fn(async () => undefined),
        confirmClose: vi.fn(async () => undefined),
        onCloseRequest: vi.fn(() => () => undefined),
      },
    } as unknown as HackDeskElectronAPI;
  }

  it('copies and exports the active draft and clears after a successful retry', async () => {
    const api = createApi();
    const { result } = renderHook(() => {
      const workspace = useNoteWorkspaceTabs('A');
      return { workspace, notice: useWorkspaceBackupNotice({ api, workspace }) };
    });
    act(() => { result.current.workspace.openDraftNote({ title: 'Draft title', content: 'Draft body' }); });
    const storage = failWrites();
    act(() => { result.current.workspace.flush(); });
    const view = render(<WorkspaceBackupNotice {...result.current.notice!} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Workspace backup failed');

    fireEvent.click(screen.getByRole('button', { name: 'Copy draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export draft' }));
    await act(async () => {});
    expect(api.app.writeClipboardText).toHaveBeenCalledWith('Draft body');
    expect(api.app.saveTextFile).toHaveBeenCalledWith(expect.objectContaining({ content: 'Draft body', defaultFileName: expect.stringContaining('Draft title') }));

    fireEvent.click(screen.getByRole('button', { name: 'Retry backup' }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Backup still failed'));
    view.unmount();
    expect(result.current.notice).not.toBeNull();

    storage.mockRestore();
    act(() => { result.current.notice!.onRetry(); });
    expect(toast.success).toHaveBeenCalledWith('Workspace backed up.');
    expect(result.current.notice).toBeNull();
  });

  it('disables copy and export when the active tab has no draft', () => {
    render(<WorkspaceBackupNotice currentWorkspaceAffected hasActiveDraft={false} otherWorkspaceAffected onCopyDraft={vi.fn()} onExportDraft={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Copy draft' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Export draft' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Another workspace is also not backed up.');
  });

  it('points to the other workspace instead of offering the current, backed-up draft', () => {
    render(<WorkspaceBackupNotice currentWorkspaceAffected={false} hasActiveDraft otherWorkspaceAffected onCopyDraft={vi.fn()} onExportDraft={vi.fn()} onRetry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Another workspace could not be backed up');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Your drafts are still open');
    expect(screen.queryByRole('button', { name: 'Copy draft' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export draft' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry backup' })).toBeEnabled();
  });

  it('confirms before closing while drafts are not backed up', async () => {
    const api = createApi();
    const confirmCloseUnsafeTabs = vi.fn(async () => true);
    const { result } = renderHook(() => useWorkbenchClosePolicy({
      api,
      backupFailed: true,
      closeTransientLayer: () => false,
      confirmCloseUnsafeTabs,
      openTabs: {},
    }));
    await act(async () => { await result.current.settleCloseRequest({ source: 'app-quit' }); });
    expect(api.app.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: 'Workspace backup failed. Close anyway?' }));
    expect(api.app.cancelClose).toHaveBeenCalledOnce();
    expect(api.app.confirmClose).not.toHaveBeenCalled();
  });
});
