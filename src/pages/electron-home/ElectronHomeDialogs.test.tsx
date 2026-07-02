import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DocumentSummary } from '@/lib/electron-api';
import { defaultSettings } from '@/lib/settings';

import { ElectronHomeDialogs, type ElectronHomeDialogsProps } from './ElectronHomeDialogs';

vi.mock('./CreateFolderDialog', () => ({
  CreateFolderDialog: () => null,
}));

vi.mock('./CreateNoteDialog', () => ({
  CreateNoteDialog: ({ state, onCreate }: {
    state: { title: string };
    onCreate: (title: string) => void;
  }) => (
    <button type="button" onClick={() => onCreate(state.title)}>Create note mock</button>
  ),
}));

vi.mock('./DeleteFolderDialog', () => ({
  DeleteFolderDialog: () => null,
}));

vi.mock('./DeleteNoteDialog', () => ({
  DeleteNoteDialog: ({ note, onDelete }: {
    note: DocumentSummary | null;
    onDelete: (note: DocumentSummary) => void;
  }) => (
    <button type="button" onClick={() => note && onDelete(note)}>Delete note mock</button>
  ),
}));

vi.mock('./HackmdOnboardingDialog', () => ({
  HackmdOnboardingDialog: ({ onConnected }: { onConnected?: () => void }) => (
    <button type="button" onClick={onConnected}>Onboarding connected mock</button>
  ),
}));

vi.mock('./RenameFolderDialog', () => ({
  RenameFolderDialog: () => null,
}));

vi.mock('./SettingsDialog', () => ({
  SettingsDialog: ({ onDisconnectHackmd }: { onDisconnectHackmd: () => void }) => (
    <button type="button" onClick={onDisconnectHackmd}>Disconnect HackMD mock</button>
  ),
}));

function createDocument(overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    content: 'Body',
    createdAtMillis: null,
    description: '',
    folderPaths: [],
    id: 'note-1',
    lastChangeUser: null,
    permalink: null,
    publishLink: 'https://hackmd.io/note-1',
    publishedAtMillis: null,
    publishType: 'edit',
    readPermission: 'owner',
    shortId: 'note-1',
    tags: [],
    tagsUpdatedAtMillis: null,
    teamPath: null,
    title: 'Note',
    titleUpdatedAtMillis: null,
    updatedAtMillis: null,
    userPath: null,
    writePermission: 'owner',
    ...overrides,
  };
}

function createProps(overrides: Partial<ElectronHomeDialogsProps> = {}): ElectronHomeDialogsProps {
  return {
    api: undefined,
    createFolderDialog: { open: false, name: '', description: '', icon: '', color: '' },
    createNoteDialog: { open: false, title: '' },
    deleteFolderTarget: null,
    deleteNoteTarget: null,
    folderLabel: null,
    onboardingOpen: false,
    renameFolderDialog: { open: false, folderId: null, name: '', description: '', icon: '', color: '' },
    scopeLabel: 'My Workspace',
    settings: {
      title: 'HackDesk',
      appearance: defaultSettings.appearance,
      hasAppearanceSettings: true,
      hasHackmdApiToken: false,
      hackmdCliConfig: { hasAccessToken: false, hasCustomEndpoint: false },
      hasLocalVault: false,
      localVault: defaultSettings.localVault,
      onboarding: defaultSettings.onboarding,
      shouldShowHackmdOnboarding: false,
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
    onCreateFolder: vi.fn(),
    onCreateFolderStateChange: vi.fn(),
    onCreateNote: vi.fn(),
    onCreateNoteStateChange: vi.fn(),
    onDeleteFolder: vi.fn(),
    onDeleteFolderCancel: vi.fn(),
    onDeleteNote: vi.fn(),
    onDeleteNoteCancel: vi.fn(),
    onChooseLocalVault: vi.fn(async () => undefined),
    onDisconnectHackmd: vi.fn(),
    onOnboardingConnected: vi.fn(),
    onForgetLocalVault: vi.fn(async () => undefined),
    onImportHackmdCliToken: vi.fn(async () => ({
      settings: {
        title: 'HackDesk',
        appearance: defaultSettings.appearance,
        hasAppearanceSettings: true,
        hasHackmdApiToken: true,
        hackmdCliConfig: { hasAccessToken: true, hasCustomEndpoint: false },
        hasLocalVault: false,
        localVault: defaultSettings.localVault,
        onboarding: defaultSettings.onboarding,
        shouldShowHackmdOnboarding: false,
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
    onOpenLocalVault: vi.fn(async () => undefined),
    onOnboardingOpenChange: vi.fn(),
    onRefreshLocalVault: vi.fn(async () => undefined),
    onRenameFolder: vi.fn(),
    onRenameFolderStateChange: vi.fn(),
    onSaveSettings: vi.fn(),
    onSaveToken: vi.fn(async () => undefined),
    onSettingsOpenChange: vi.fn(),
    onSetupLater: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderDialogs(props: ElectronHomeDialogsProps) {
  render(<ElectronHomeDialogs {...props} />);
}

describe('ElectronHomeDialogs', () => {
  it('wires create note through the dialog composition', () => {
    const onCreateNote = vi.fn();
    const onCreateNoteStateChange = vi.fn();
    renderDialogs(createProps({
      createNoteDialog: { open: true, title: 'Draft' },
      onCreateNote,
      onCreateNoteStateChange,
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Create note mock' }));

    expect(onCreateNote).toHaveBeenCalledWith('Draft');
  });

  it('wires delete note through the dialog composition', () => {
    const note = createDocument();
    const onDeleteNote = vi.fn();
    renderDialogs(createProps({
      deleteNoteTarget: note,
      onDeleteNote,
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete note mock' }));

    expect(onDeleteNote).toHaveBeenCalledWith(note);
  });

  it('wires onboarding connection success through the dialog composition', () => {
    const onOnboardingConnected = vi.fn();
    renderDialogs(createProps({ onOnboardingConnected }));

    fireEvent.click(screen.getByRole('button', { name: 'Onboarding connected mock' }));

    expect(onOnboardingConnected).toHaveBeenCalledOnce();
  });

  it('wires HackMD disconnect through the settings composition', () => {
    const onDisconnectHackmd = vi.fn();
    renderDialogs(createProps({ onDisconnectHackmd }));

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect HackMD mock' }));

    expect(onDisconnectHackmd).toHaveBeenCalledOnce();
  });
});
