import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ElectronActionContext } from '@/lib/electron-actions';
import { defaultSettings } from '@/lib/settings';

import { ElectronHomeOverlays, type ElectronHomeOverlaysProps } from './ElectronHomeOverlays';

vi.mock('./CommandPaletteDialog', () => ({
  CommandPaletteDialog: ({ onRunAction }: { onRunAction: (actionId: 'refresh') => void }) => (
    <button type="button" onClick={() => onRunAction('refresh')}>Palette mock</button>
  ),
}));

vi.mock('./ElectronHomeDialogs', () => ({
  ElectronHomeDialogs: ({ onCreateNote }: { onCreateNote: (title: string) => void }) => (
    <button type="button" onClick={() => onCreateNote('Draft')}>Dialogs mock</button>
  ),
}));

const actionContext: ElectronActionContext = {
  activePaneTabCount: 0,
  activePaneTabsToRightCount: 0,
  canCreate: true,
  canModifySelectedFolder: false,
  hasToken: true,
  inspectorCollapsed: false,
  isSavingNote: false,
  navigationBackCount: 0,
  navigationForwardCount: 0,
  navigatorCollapsed: false,
  noteDirty: false,
  openTabCount: 0,
  paneCount: 1,
  recentlyClosedTabCount: 0,
  scopeType: 'personal',
  selectedFolderId: null,
  selectedNoteId: null,
  workspaceRailCollapsed: false,
};

function createProps(overrides: Partial<ElectronHomeOverlaysProps> = {}): ElectronHomeOverlaysProps {
  return {
    commandPalette: {
      context: actionContext,
      folderTree: {
        allNotes: [],
        nodesById: new Map(),
        roots: [],
        unfiled: {
          children: [],
          color: null,
          folderPath: [],
          icon: null,
          id: '__hackdesk_unfiled__',
          name: 'Root',
          notes: [],
          parentId: null,
        },
      },
      onRunAction: vi.fn(),
      onSelectFolder: vi.fn(),
      onSelectNote: vi.fn(),
      onSelectRecentNote: vi.fn(),
      onSelectWorkspace: vi.fn(),
      onShowFinderResults: vi.fn(),
      onStateChange: vi.fn(),
      recentNotes: [],
      scope: { type: 'personal', label: 'My Workspace' },
      selectedFolderId: null,
      selectedNoteId: null,
      state: { open: false, search: '' },
      teams: [],
    },
    dialogs: {
      createFolderDialog: { open: false, name: '', description: '', icon: '', color: '' },
      createNoteDialog: { open: false, title: '' },
      deleteFolderTarget: null,
      deleteNoteTarget: null,
      folderLabel: null,
      onboardingOpen: false,
      onCreateFolder: vi.fn(),
      onCreateFolderStateChange: vi.fn(),
      onCreateNote: vi.fn(),
      onCreateNoteStateChange: vi.fn(),
      onDeleteFolder: vi.fn(),
      onDeleteFolderCancel: vi.fn(),
      onDeleteNote: vi.fn(),
      onDeleteNoteCancel: vi.fn(),
      onImportHackmdCliToken: vi.fn(async () => ({
        settings: {
          appearance: defaultSettings.appearance,
          hackmdCliConfig: { hasAccessToken: true, hasCustomEndpoint: false },
          hasAppearanceSettings: true,
          hasHackmdApiToken: true,
          onboarding: defaultSettings.onboarding,
          shouldShowHackmdOnboarding: false,
          title: 'HackDesk',
        },
        user: {
          email: 'michael@example.com',
          id: 'user-1',
          name: 'Michael',
          photo: null,
          teams: [],
          upgraded: false,
          username: 'michael',
        },
      })),
      onOnboardingOpenChange: vi.fn(),
      onRenameFolder: vi.fn(),
      onRenameFolderStateChange: vi.fn(),
      onSaveSettings: vi.fn(),
      onSaveToken: vi.fn(async () => undefined),
      onSettingsOpenChange: vi.fn(),
      onSetupLater: vi.fn(async () => undefined),
      renameFolderDialog: { open: false, folderId: null, name: '', description: '', icon: '', color: '' },
      scopeLabel: 'My Workspace',
      settings: {
        appearance: defaultSettings.appearance,
        hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
        hasAppearanceSettings: true,
        hasHackmdApiToken: false,
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: false,
        title: 'HackDesk',
      },
      settingsOpen: false,
      status: {
        creatingFolder: false,
        creatingNote: false,
        deletingFolder: false,
        deletingNote: false,
        renamingFolder: false,
        savingSettings: false,
      },
    },
    ...overrides,
  };
}

describe('ElectronHomeOverlays', () => {
  it('wires command palette and dialog callbacks through overlay composition', () => {
    const onRunAction = vi.fn();
    const onCreateNote = vi.fn();
    render(<ElectronHomeOverlays {...createProps({
      commandPalette: {
        ...createProps().commandPalette,
        onRunAction,
      },
      dialogs: {
        ...createProps().dialogs,
        onCreateNote,
      },
    })}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Palette mock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dialogs mock' }));

    expect(onRunAction).toHaveBeenCalledWith('refresh');
    expect(onCreateNote).toHaveBeenCalledWith('Draft');
  });
});
