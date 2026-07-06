import { useCallback, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { ElectronActionId } from '@/lib/electron-api';
import { DEFAULT_ACTION_KEYBINDINGS } from '@/lib/electron-actions';
import {
  clearNoteFinderFilters,
  clearNoteFinderQuery,
  hasActiveNoteFinderFilters,
  type NoteFinderState,
} from '@/lib/electron-note-finder';
import {
  matchShortcutConfig,
  resolveActionShortcut,
  type ShortcutOverrides,
} from '@/lib/keyboard-shortcuts';

export type WorkbenchShortcutHandlers = {
  activeFinderState: NoteFinderState;
  closeTransientLayer: () => boolean;
  focusPaneAtIndex: (paneIndex: number) => boolean;
  focusTabAtIndex: (tabIndex: number) => boolean;
  handleCreateNote: () => void;
  noteDirty: boolean;
  openPalette: () => void;
  paneCount: number;
  platform: string;
  refreshWorkspace: () => void;
  runAction: (actionId: ElectronActionId) => void;
  selectedFolderId: string | null;
  setFinderState: Dispatch<SetStateAction<NoteFinderState>>;
  setSelectedFolderId: Dispatch<SetStateAction<string | null>>;
  shortcuts?: ShortcutOverrides;
};

export function useWorkbenchShortcuts({
  activeFinderState,
  closeTransientLayer,
  focusPaneAtIndex,
  focusTabAtIndex,
  handleCreateNote,
  noteDirty,
  openPalette,
  paneCount,
  platform,
  refreshWorkspace,
  runAction,
  selectedFolderId,
  setFinderState,
  setSelectedFolderId,
  shortcuts,
}: WorkbenchShortcutHandlers) {
  const handleGlobalKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) {
      return;
    }

    const isPrimaryModifier = isPlatformPrimaryModifier(event, platform);
    if (isPrimaryModifier && !event.altKey && !event.shiftKey && /^[1-9]$/.test(event.key)) {
      if (paneCount > 1) {
        const targetPaneIndex = Number(event.key) - 1;
        if (targetPaneIndex < 2 && focusPaneAtIndex(targetPaneIndex)) {
          event.preventDefault();
        }
        return;
      }

      const targetTabIndex = event.key === '9' ? -1 : Number(event.key) - 1;
      if (focusTabAtIndex(targetTabIndex)) {
        event.preventDefault();
      }
      return;
    }

    if (matchesActionShortcut('save-note', event, platform, shortcuts)) {
      if (noteDirty) {
        event.preventDefault();
        runAction('save-note');
      }
      return;
    }

    if (event.ctrlKey && event.key === 'Tab') {
      event.preventDefault();
      runAction(event.shiftKey ? 'focus-previous-tab' : 'focus-next-tab');
      return;
    }

    if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && shouldFocusNoteFilter(event)) {
      event.preventDefault();
      runAction('search-notes');
      return;
    }

    const matchedAction = WORKBENCH_SHORTCUT_ACTIONS.find((actionId) => (
      actionId !== 'save-note' && matchesActionShortcut(actionId, event, platform, shortcuts)
    ));
    if (matchedAction) {
      event.preventDefault();
      if (matchedAction === 'open-command-palette') {
        openPalette();
      } else if (matchedAction === 'new-note') {
        handleCreateNote();
      } else if (matchedAction === 'refresh') {
        refreshWorkspace();
      } else {
        runAction(matchedAction);
      }
      return;
    }

    if (event.key !== 'Escape') {
      return;
    }

    if (closeTransientLayer()) {
      return;
    }

    const targetZone = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-hackdesk-focus]')?.dataset.hackdeskFocus
      : null;
    if (targetZone === 'editor' || targetZone === 'inspector') {
      return;
    }

    if (activeFinderState.query) {
      setFinderState((current) => clearNoteFinderQuery(current));
      return;
    }

    if (hasActiveNoteFinderFilters(activeFinderState)) {
      setFinderState((current) => clearNoteFinderFilters(current));
      return;
    }

    if (selectedFolderId) {
      setSelectedFolderId(null);
    }
  }, [
    activeFinderState,
    closeTransientLayer,
    focusPaneAtIndex,
    focusTabAtIndex,
    handleCreateNote,
    noteDirty,
    openPalette,
    paneCount,
    platform,
    refreshWorkspace,
    runAction,
    selectedFolderId,
    setFinderState,
    setSelectedFolderId,
    shortcuts,
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);
}

const WORKBENCH_SHORTCUT_ACTIONS: ElectronActionId[] = [
  'open-command-palette',
  'open-quick-open',
  'open-settings',
  'new-note',
  'new-folder',
  'new-tab',
  'import-markdown-note',
  'find-in-note',
  'close-tab',
  'reopen-last-closed-tab',
  'focus-next-tab',
  'focus-previous-tab',
  'navigate-back',
  'navigate-forward',
  'toggle-workspace-rail',
  'toggle-navigator',
  'toggle-inspector',
  'split-pane-right',
  'export-debug-logs',
  'focus-workspace',
  'focus-navigator',
  'focus-editor',
  'focus-inspector',
  'refresh',
  'save-note',
];

function matchesActionShortcut(
  actionId: ElectronActionId,
  event: KeyboardEvent,
  platform: string,
  shortcuts?: ShortcutOverrides,
) {
  return matchShortcutConfig(
    resolveActionShortcut(actionId, DEFAULT_ACTION_KEYBINDINGS, shortcuts),
    event,
    platform,
  );
}

function isPlatformPrimaryModifier(event: KeyboardEvent, platform: string) {
  const isMac = platform === 'darwin' || platform.toLowerCase().includes('mac');
  return isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}

function shouldFocusNoteFilter(event: KeyboardEvent) {
  if (!(event.target instanceof Element)) {
    return true;
  }

  return !event.target.closest([
    'input',
    'textarea',
    'select',
    '[contenteditable]:not([contenteditable="false"])',
    '.cm-editor',
    '[data-hackdesk-focus="editor"]',
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[role="menu"]',
    '[role="listbox"]',
  ].join(','));
}
