import { useCallback } from 'react';
import { useMutation, useMutationState, useQueryClient, type MutationState } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';

import type {
  CreateFolderInput,
  CreateNoteInput,
  DocumentSummary,
  FolderSummary,
  HackDeskElectronAPI,
  NoteSummary,
  RepositoryValue,
  UpdateFolderInput,
  UpdateNoteInput,
  UploadNoteImageInput,
} from '@/lib/electron-api';
import type { LocalDocument, LocalVaultSnapshot } from '@/lib/local-vault';
import { HACKMD_NOTE_CHANGED_MESSAGE } from '@/lib/note-errors';
import type { FolderDropOperation } from '@/lib/hackmd-folder-dnd';

import type { LocalDocumentSummary } from './local-vault-adapter';
import { TEMPLATES_FOLDER_NAME } from '@/lib/note-templates';
import { getLocalVaultDocumentQueryKey, cacheLocalVaultSnapshot as cacheSnapshot } from './useElectronLocalVault';
import {
  getFoldersQueryKey,
  getFolderOrderQueryKey,
  getWorkspaceQueryKey,
  getScopeStorageKey,
} from './repository';
import { noteVersionsKeys } from './useNoteVersions';
import { noteCommentsKeys } from './useNoteComments';
import type { NoteDocumentDraft, NoteIdentity } from './note-workspace';
import { draftSyncKey, noteSyncKey, type SyncActivityEvent, type SyncKey } from './note-sync-activity';
import type { SettingsFormInput, WorkspaceScope } from './types';
import { createQuickNoteContent } from './ui';
import { getNoteOperations, getWorkspaceCapabilities, getWorkspaceOperations, isLocalVaultNote } from './workspace-operations';
import { trashKeys } from './useTrash';

const DEFAULT_DRAFT_NOTE_TITLE = 'Untitled';
const NOTE_RESTORE_TOAST_MS = 10_000;

// Mutation observers receive new options when the workspace changes. Carry the
// initiating callbacks and API closure with each request, including its awaits.
/** Reports each request's progress per note, so tabs show their own save, delete or upload. */
type MutationSync<TVariables> = {
  kind: 'save' | 'delete' | 'upload';
  key: (variables: TVariables) => SyncKey | null;
  report?: (event: SyncActivityEvent) => void;
};

let nextSyncRequestId = 0;

function reportSyncStart<TVariables>(sync: MutationSync<TVariables> | undefined, variables: TVariables) {
  const key = sync?.report ? sync.key(variables) : null;
  if (!sync?.report || !key) return null;
  const requestId = ++nextSyncRequestId;
  if (sync.kind === 'save') sync.report({ type: 'save_started', key, requestId });
  else if (sync.kind === 'delete') sync.report({ type: 'delete_started', key, requestId });
  else sync.report({ type: 'upload_started', key });
  return { key, requestId };
}

function reportSyncEnd<TVariables>(
  sync: MutationSync<TVariables> | undefined,
  started: { key: SyncKey; requestId: number } | null | undefined,
  error: Error | null,
) {
  if (!sync?.report || !started) return;
  const { key, requestId } = started;
  if (sync.kind === 'save') {
    sync.report(error ? { type: 'save_failed', key, requestId, error } : { type: 'save_succeeded', key, requestId });
  } else if (sync.kind === 'delete') {
    sync.report({ type: 'delete_settled', key, requestId });
  } else {
    sync.report({ type: 'upload_settled', key });
  }
}

function useWorkspaceMutation<TData, TVariables>(scope: WorkspaceScope, name: string, operation: {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error) => void;
  sync?: MutationSync<TVariables>;
}) {
  const queryClient = useQueryClient();
  const scopeKey = getScopeStorageKey(scope);
  type Request = { scopeKey: string | null; variables: TVariables; operation: typeof operation };
  const mutationKey = ['electron', 'workspace-mutation', name, scopeKey];
  const mutation = useMutation({
    mutationKey,
    mutationFn: (request: Request) => request.operation.mutationFn(request.variables),
    onMutate: (request: Request) => reportSyncStart(request.operation.sync, request.variables),
    onSuccess: (data, request, started) => {
      reportSyncEnd(request.operation.sync, started, null);
      request.operation.onSuccess?.(data, request.variables);
    },
    onError: (error: Error, request, started) => {
      reportSyncEnd(request.operation.sync, started, error);
      request.operation.onError?.(error);
    },
  });
  // Observe the cache so returning to A still shows its pending operation even
  // when the same hook has started another operation in B in the meantime.
  const states = useMutationState({
    filters: { mutationKey: ['electron', 'workspace-mutation', name] },
    select: (entry) => entry.state as MutationState<TData, Error, Request>,
  });
  const current = states.filter((entry) => entry.variables?.scopeKey === scopeKey).at(-1);
  const status = current?.status ?? 'idle';
  const resetObserver = mutation.reset;
  const reset = useCallback(() => {
    resetObserver();
    const cache = queryClient.getMutationCache();
    cache.findAll({ mutationKey: ['electron', 'workspace-mutation', name, scopeKey], exact: true }).forEach((entry) => cache.remove(entry));
  }, [resetObserver, queryClient, name, scopeKey]);
  return {
    ...mutation,
    ...current,
    status,
    data: current?.data,
    error: current?.error ?? null,
    variables: current?.variables?.variables,
    context: current?.context,
    isPaused: current?.isPaused ?? false,
    failureCount: current?.failureCount ?? 0,
    failureReason: current?.failureReason ?? null,
    submittedAt: current?.submittedAt ?? 0,
    isIdle: status === 'idle',
    isPending: status === 'pending',
    isSuccess: status === 'success',
    isError: status === 'error',
    reset,
    mutate: (variables: TVariables) => mutation.mutate({ scopeKey, variables, operation }),
    mutateAsync: (variables: TVariables) => mutation.mutateAsync({ scopeKey, variables, operation }),
  };
}

export type SaveIntent = 'content' | 'metadata' | 'sharing';

export type UpdateNoteMutationVariables = {
  /** A full document for content writes; a sidebar summary suffices for metadata-only updates. */
  note: NoteSummary;
  input: UpdateNoteInput;
  intent: SaveIntent;
  tabId?: string;
  submittedDraft?: NoteDocumentDraft;
  successMessage?: string;
};

export function deriveDraftNoteTitle(input: { title?: string; content?: string }) {
  const explicitTitle = input.title?.trim() ?? '';
  if (explicitTitle && explicitTitle !== DEFAULT_DRAFT_NOTE_TITLE) {
    return explicitTitle;
  }

  const contentTitle = (input.content ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.replace(/^#{1,6}\s+/, '')
    .trim();

  return contentTitle || explicitTitle || DEFAULT_DRAFT_NOTE_TITLE;
}

function upsertNoteInRepositoryValue(
  current: RepositoryValue<NoteSummary[]> | undefined,
  note: NoteSummary,
): RepositoryValue<NoteSummary[]> {
  const data = current?.data ?? [];
  const nextData = [
    note,
    ...data.filter((candidate) => candidate.id !== note.id || (candidate.teamPath ?? null) !== (note.teamPath ?? null)),
  ];

  return {
    source: current?.source === 'cached' ? 'cached' : 'remote',
    data: nextData,
  };
}

function repositoryDocumentValue(
  current: RepositoryValue<DocumentSummary> | undefined,
  document: DocumentSummary,
): RepositoryValue<DocumentSummary> {
  return {
    source: current?.source === 'cached' ? 'cached' : 'remote',
    data: document,
  };
}

function getParentPathFromRelativePath(relativePath: string) {
  const slashIndex = relativePath.lastIndexOf('/');
  return slashIndex === -1 ? null : relativePath.slice(0, slashIndex);
}

function localDocumentFromSummary(
  current: LocalDocument | undefined,
  document: LocalDocumentSummary,
): LocalDocument {
  return {
    id: document.id,
    title: document.title,
    relativePath: document.localRelativePath,
    parentPath: getParentPathFromRelativePath(document.localRelativePath),
    createdAtMillis: document.createdAtMillis,
    updatedAtMillis: document.updatedAtMillis,
    revision: document.localRevision,
    content: document.content ?? current?.content ?? '',
  };
}

function removeNoteFromRepositoryValue(
  current: RepositoryValue<NoteSummary[]> | undefined,
  note: NoteIdentity,
): RepositoryValue<NoteSummary[]> | undefined {
  if (!current) {
    return current;
  }

  if (!Array.isArray(current.data)) {
    return current;
  }

  return {
    ...current,
    data: current.data.filter((candidate) => (
      candidate.id !== note.id || (candidate.teamPath ?? null) !== (note.teamPath ?? null)
    )),
  };
}

export function useElectronNoteMutations({
  api,
  scope,
  selectedNote,
  selectedParentFolderId,
  onSettingsSaved,
  onNoteCreated,
  onDraftNoteCreated,
  onNoteSaved,
  onFolderCreated,
  onFolderRenamed,
  onFolderDeleted,
  onNoteDeleted,
  onNoteMoved,
  onSyncActivity,
}: {
  api?: HackDeskElectronAPI;
  scope: WorkspaceScope;
  selectedNote: NoteIdentity | null;
  selectedParentFolderId?: string;
  onSettingsSaved: () => void;
  onNoteCreated: (note: NoteSummary) => void;
  onDraftNoteCreated: (tabId: string, note: NoteSummary, submittedDraft: NoteDocumentDraft) => void;
  onNoteSaved: (note: NoteSummary, variables: UpdateNoteMutationVariables) => void;
  onFolderCreated: (folder: FolderSummary) => void;
  onFolderRenamed: (folder: FolderSummary) => void;
  onFolderDeleted: (folderId: string, parentFolderId: string | null) => void;
  onNoteDeleted: (note: DocumentSummary) => void;
  onNoteMoved: (note: NoteSummary, targetFolderId: string | null) => void;
  /** Receives each note's save, delete and upload progress. */
  onSyncActivity?: (event: SyncActivityEvent) => void;
}) {
  const queryClient = useQueryClient();

  const cacheLocalVaultSnapshot = useCallback((snapshot: LocalVaultSnapshot) => {
    cacheSnapshot(queryClient, snapshot);
  }, [queryClient]);

  // Resolved when a request starts, from the scope and API of the render that started it.
  const requireApi = () => {
    if (!api) {
      throw new Error('Electron API is unavailable.');
    }
    return api;
  };
  const workspaceOperations = () => getWorkspaceOperations(requireApi(), scope, cacheLocalVaultSnapshot);
  const noteOperations = (note: Pick<NoteSummary, 'teamPath'>) => getNoteOperations(requireApi(), scope, note, cacheLocalVaultSnapshot);
  const { listsFromSnapshot, hasFolders } = getWorkspaceCapabilities(scope);
  /** HackMD folder lists are queries to refresh after a change; Local Vault ones arrive in its snapshot. */
  const refreshesFolderQueries = hasFolders && !listsFromSnapshot;

  const clearHackmdQueryCache = useCallback(() => {
    queryClient.removeQueries({ queryKey: ['electron', 'hackmd'] });
  }, [queryClient]);

  const invalidateCurrentNoteQueries = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope) });
    if (selectedNote) {
      void queryClient.invalidateQueries({
        queryKey: ['electron', 'hackmd', 'note', selectedNote.teamPath ?? null, selectedNote.id],
      });
    }
  }, [queryClient, scope, selectedNote]);

  const seedWorkspaceNote = useCallback((note: NoteSummary) => {
    queryClient.setQueryData<RepositoryValue<NoteSummary[]> | undefined>(
      getWorkspaceQueryKey(scope),
      (current) => upsertNoteInRepositoryValue(current, note),
    );
    queryClient.setQueryData(
      ['electron', 'hackmd', 'note', note.teamPath ?? null, note.id],
      { source: 'remote', data: note },
    );
  }, [queryClient, scope]);

  const invalidateCurrentFolderQueries = useCallback(() => {
    if (hasFolders) {
      void queryClient.invalidateQueries({ queryKey: getFoldersQueryKey(scope) });
      void queryClient.invalidateQueries({ queryKey: getFolderOrderQueryKey(scope) });
    }
  }, [queryClient, scope, hasFolders]);

  const updateSettingsMutation = useMutation({
    scope: { id: 'settings' },
    mutationFn: (input: SettingsFormInput) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      return api.settings.update(input);
    },
    onSuccess: (nextSettings, input) => {
      queryClient.setQueryData(['electron', 'settings'], nextSettings);
      if (input.hackmdApiToken !== undefined || input.hackmdActiveAccountId !== undefined || input.hackmdRemoveAccountId !== undefined) {
        if (nextSettings.hasHackmdApiToken) {
          void queryClient.invalidateQueries({ queryKey: ['electron', 'hackmd'] });
        } else {
          clearHackmdQueryCache();
        }
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to save settings.'),
  });

  const submitSettings = async (input: SettingsFormInput) => {
    try {
      // Settings saves at once and stays open; only failures surface.
      await updateSettingsMutation.mutateAsync(input);
    } catch {
      // The mutation reports persistence errors and leaves Settings open.
    }
  };

  const importHackmdCliTokenMutation = useMutation({
    mutationFn: async () => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      return api.settings.importHackmdCliToken();
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['electron', 'settings'], result.settings);
      void queryClient.invalidateQueries({ queryKey: ['electron', 'hackmd'] });
      onSettingsSaved();
      toast.success('Imported hackmd-cli token.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to import hackmd-cli token.'),
  });

  const disconnectHackmdMutation = useMutation({
    mutationFn: () => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      return api.settings.update({
        hackmdApiToken: '',
        onboarding: { hackmdTokenSetupDeferred: true },
      });
    },
    onSuccess: (nextSettings) => {
      queryClient.setQueryData(['electron', 'settings'], nextSettings);
      clearHackmdQueryCache();
      onSettingsSaved();
      toast.success('HackMD disconnected.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to disconnect HackMD.'),
  });

  const createNoteMutation = useWorkspaceMutation(scope, 'create-note', {
    mutationFn: (title: string) => workspaceOperations().createNote({
      title,
      content: createQuickNoteContent(title),
      parentFolderId: selectedParentFolderId,
    }),
    onSuccess: (createdNote) => {
      if (!listsFromSnapshot) {
        seedWorkspaceNote(createdNote);
      }
      onNoteCreated(createdNote);
      void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope), refetchType: 'inactive' });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create note.'),
  });

  const createDraftNoteMutation = useWorkspaceMutation(scope, 'create-draft', {
    sync: { kind: 'save', key: (variables) => draftSyncKey(variables.tabId), report: onSyncActivity },
    mutationFn: (variables: { tabId: string; input: Pick<UpdateNoteInput, 'title' | 'content'> }) => workspaceOperations().createNoteFromDraft({
      title: deriveDraftNoteTitle(variables.input),
      content: variables.input.content ?? '',
      parentFolderId: selectedParentFolderId,
    }),
    onSuccess: (createdNote, variables) => {
      if (!listsFromSnapshot) {
        seedWorkspaceNote(createdNote);
      }
      // The draft's tab becomes the note's tab. Give it the saved document at once, as a save of an
      // existing note does: a cold document query shows the loading view in its place, which
      // removes the focused editor and drops focus to the page.
      const savedNote = { ...createdNote, content: createdNote.content ?? variables.input.content ?? '' };
      if (isLocalVaultNote(scope, createdNote)) {
        queryClient.setQueryData<LocalDocument | undefined>(
          getLocalVaultDocumentQueryKey(createdNote.id, (createdNote as LocalDocumentSummary).localVaultId),
          (current) => localDocumentFromSummary(current, savedNote as LocalDocumentSummary),
        );
      } else {
        queryClient.setQueryData<RepositoryValue<DocumentSummary> | undefined>(
          ['electron', 'hackmd', 'note', createdNote.teamPath ?? null, createdNote.id],
          (current) => repositoryDocumentValue(current, savedNote),
        );
      }
      onDraftNoteCreated(variables.tabId, createdNote, {
        title: variables.input.title ?? DEFAULT_DRAFT_NOTE_TITLE,
        content: variables.input.content ?? '',
      });
      void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope), refetchType: 'inactive' });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to save note.'),
  });

  const duplicateNoteMutation = useWorkspaceMutation(scope, 'duplicate-note', {
    mutationFn: (note: NoteSummary) => workspaceOperations().duplicateNote(note),
    onSuccess: (createdNote) => {
      if (!listsFromSnapshot) {
        seedWorkspaceNote(createdNote);
      }
      onNoteCreated(createdNote);
      void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope), refetchType: 'inactive' });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to duplicate note.'),
  });

  /** Copies a note into the Templates folder, creating the folder the first time. */
  const saveAsTemplateMutation = useWorkspaceMutation(scope, 'save-as-template', {
    mutationFn: (input: { title: string; content: string; templatesFolderId: string | null }) => workspaceOperations().saveTemplate(input),
    onSuccess: (createdNote) => {
      if (!listsFromSnapshot) {
        seedWorkspaceNote(createdNote);
      }
      void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope) });
      toast.success(`Saved “${createdNote.title || 'Untitled'}” to ${TEMPLATES_FOLDER_NAME}.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to save the template.'),
  });

  const importMarkdownNoteMutation = useWorkspaceMutation(scope, 'import-note', {
    mutationFn: (input: CreateNoteInput) => workspaceOperations().importNote(input),
    onSuccess: (createdNote) => {
      if (!listsFromSnapshot) {
        seedWorkspaceNote(createdNote);
      }
      onNoteCreated(createdNote);
      void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope), refetchType: 'inactive' });
      toast.success('Markdown note imported.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to import markdown note.'),
  });

  const createFolderMutation = useWorkspaceMutation(scope, 'create-folder', {
    mutationFn: (input: CreateFolderInput) => workspaceOperations().createFolder({
      ...input,
      parentFolderId: selectedParentFolderId,
    }),
    onSuccess: (createdFolder) => {
      if (refreshesFolderQueries) {
        void queryClient.invalidateQueries({ queryKey: getFoldersQueryKey(scope) });
        void queryClient.invalidateQueries({ queryKey: getFolderOrderQueryKey(scope) });
      }
      onFolderCreated(createdFolder);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create folder.'),
  });

  // Reads the note from HackMD before saving, so a newer remote version is
  // never overwritten. When the draft started from the cached note, its ETag
  // lets HackMD answer 304 instead of sending the whole note again. Shows the
  // newer version so it can be compared.
  const readLatestRemoteNote = async (hackmd: HackDeskElectronAPI['hackmd'], note: DocumentSummary, baseContent: string) => {
    const uncheckedMessage = 'Could not check HackMD for newer changes, so your draft was not saved.';
    if (note.etag && note.content === baseContent) {
      try {
        return await hackmd.getNoteIfChanged(note.id, note.teamPath ?? null, note.etag);
      } catch (error) {
        throw new Error(`${uncheckedMessage}${error instanceof Error ? ` ${error.message}` : ''}`);
      }
    }

    const latest = await hackmd.getNote(note.id, note.teamPath ?? null);
    if (latest.source !== 'remote') {
      const reason = latest.source === 'error' ? ` ${latest.error}` : '';
      throw new Error(`${uncheckedMessage}${reason}`);
    }
    return latest.data;
  };

  const assertRemoteNoteUnchanged = async (hackmd: HackDeskElectronAPI['hackmd'], note: DocumentSummary, baseContent: string) => {
    const latest = await readLatestRemoteNote(hackmd, note, baseContent);
    if (latest && latest.content !== baseContent) {
      queryClient.setQueryData<RepositoryValue<DocumentSummary>>(
        ['electron', 'hackmd', 'note', note.teamPath ?? null, note.id],
        { source: 'remote', data: latest },
      );
      throw new Error(HACKMD_NOTE_CHANGED_MESSAGE);
    }
  };

  const updateNoteMutation = useWorkspaceMutation(scope, 'update-note', {
    sync: { kind: 'save', key: (variables) => noteSyncKey(variables.note), report: onSyncActivity },
    mutationFn: async (variables: UpdateNoteMutationVariables) => {
      const { note, input } = variables;
      const payload = {
        ...input,
        ...(input.title !== undefined ? { title: input.title.trim() || 'Untitled' } : {}),
      };
      const operations = noteOperations(note);
      if (operations.checksRemoteChanges && payload.content !== undefined) {
        // Only content writes assert against the note's text, so only they need a full document.
        const document = note as DocumentSummary;
        await assertRemoteNoteUnchanged(requireApi().hackmd, document, variables.submittedDraft?.baseContent ?? document.content);
      }
      return operations.saveNote(note, payload, variables.submittedDraft);
    },
    onSuccess: (updatedNote, variables) => {
      onNoteSaved(updatedNote, variables);
      if (isLocalVaultNote(scope, updatedNote)) {
        queryClient.setQueryData<LocalDocument | undefined>(
          getLocalVaultDocumentQueryKey(updatedNote.id, (updatedNote as LocalDocumentSummary).localVaultId),
          (current) => localDocumentFromSummary(current, updatedNote as LocalDocumentSummary),
        );
      } else {
        queryClient.setQueryData<RepositoryValue<NoteSummary[]> | undefined>(
          getWorkspaceQueryKey(scope),
          (current) => upsertNoteInRepositoryValue(current, updatedNote),
        );
        queryClient.setQueryData<RepositoryValue<DocumentSummary> | undefined>(
          ['electron', 'hackmd', 'note', variables.note.teamPath ?? null, variables.note.id],
          (current) => repositoryDocumentValue(current, updatedNote),
        );
        // HackMD may save a version with each write. Refresh only version views that are open.
        void queryClient.invalidateQueries({ queryKey: noteVersionsKeys.all(variables.note.id), refetchType: 'active' });
        // A write can move comment anchors too.
        void queryClient.invalidateQueries({ queryKey: noteCommentsKeys.all(variables.note.id), refetchType: 'active' });
      }
      // Routine saves show in the tab and the editor header; only a named change gets a toast.
      if (variables.successMessage) toast.success(variables.successMessage);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to save note.'),
  });

  const uploadNoteImageMutation = useWorkspaceMutation(scope, 'upload-image', {
    sync: { kind: 'upload', key: (variables) => noteSyncKey(variables.note), report: onSyncActivity },
    mutationFn: ({ note, input, signal }: { note: DocumentSummary; input: UploadNoteImageInput; signal?: AbortSignal }) => (
      noteOperations(note).uploadImage(note, input, signal)
    ),
    onSuccess: (_uploadedImage, { note }) => {
      if (!isLocalVaultNote(scope, note)) {
        void queryClient.invalidateQueries({
          queryKey: ['electron', 'hackmd', 'note', note.teamPath ?? null, note.id],
        });
      }
    },
  });

  const deleteNoteMutation = useWorkspaceMutation(scope, 'delete-note', {
    sync: { kind: 'delete', key: (note) => noteSyncKey(note), report: onSyncActivity },
    mutationFn: async (note: DocumentSummary) => {
      await noteOperations(note).deleteNote(note);
      return note;
    },
    onSuccess: (note) => {
      if (!listsFromSnapshot) {
        queryClient.setQueryData<RepositoryValue<NoteSummary[]> | undefined>(
          getWorkspaceQueryKey(scope),
          (current) => removeNoteFromRepositoryValue(current, note),
        );
      }
      onNoteDeleted(note);
      if (!listsFromSnapshot) {
        void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope) });
        void queryClient.invalidateQueries({
          queryKey: ['electron', 'hackmd', 'note', note.teamPath ?? null, note.id],
        });
        if (noteOperations(note).restoresFromTrash) void queryClient.invalidateQueries({ queryKey: trashKeys.list });
      }
      // HackMD keeps deleted personal notes in its trash. Team notes have no
      // restore endpoint, so only personal notes offer Undo.
      const canRestore = noteOperations(note).restoresFromTrash;
      toast.success('Note deleted.', canRestore ? {
        duration: NOTE_RESTORE_TOAST_MS,
        action: { label: 'Undo', onClick: () => restoreNoteMutation.mutate(note) },
      } : undefined);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to delete note.'),
  });

  const restoreNoteMutation = useWorkspaceMutation(scope, 'restore-note', {
    mutationFn: async (note: DocumentSummary) => {
      await requireApi().hackmd.restoreNote(note.id);
      return note;
    },
    onSuccess: (note) => {
      void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope) });
      void queryClient.invalidateQueries({ queryKey: ['electron', 'hackmd', 'note', note.teamPath ?? null, note.id] });
      void queryClient.invalidateQueries({ queryKey: trashKeys.list });
      toast.success(`Restored “${note.title || 'Untitled'}”.`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to restore note.'),
  });

  const moveNoteMutation = useWorkspaceMutation(scope, 'move-note', {
    mutationFn: async ({ note, targetFolderId }: { note: NoteSummary; targetFolderId: string | null }) => ({
      note: await workspaceOperations().moveNote(note, targetFolderId),
      targetFolderId,
    }),
    onSuccess: ({ note, targetFolderId }) => {
      if (listsFromSnapshot) {
        queryClient.setQueryData<LocalDocument | undefined>(
          getLocalVaultDocumentQueryKey(note.id, (note as LocalDocumentSummary).localVaultId),
          (current) => current ? {
            ...current,
            relativePath: (note as LocalDocumentSummary).localRelativePath,
            parentPath: getParentPathFromRelativePath((note as LocalDocumentSummary).localRelativePath),
            revision: (note as LocalDocumentSummary).localRevision,
          } : current,
        );
      } else {
        void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope) });
        void queryClient.invalidateQueries({
          queryKey: ['electron', 'hackmd', 'note', note.teamPath ?? null, note.id],
        });
      }
      onNoteMoved(note, targetFolderId);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to move note.'),
  });

  const renameFolderMutation = useWorkspaceMutation(scope, 'rename-folder', {
    mutationFn: ({ folderId, input }: { folderId: string; input: UpdateFolderInput }) => {
      const name = (input.name ?? '').trim();
      if (!name) {
        throw new Error('Folder name is required.');
      }
      return workspaceOperations().renameFolder(folderId, { ...input, name });
    },
    onSuccess: (updatedFolder) => {
      if (refreshesFolderQueries) {
        void queryClient.invalidateQueries({ queryKey: getFoldersQueryKey(scope) });
        void queryClient.invalidateQueries({ queryKey: getFolderOrderQueryKey(scope) });
      }
      onFolderRenamed(updatedFolder);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to rename folder.'),
  });

  const deleteFolderMutation = useWorkspaceMutation(scope, 'delete-folder', {
    mutationFn: async ({ folderId, parentFolderId }: { folderId: string; parentFolderId: string | null }) => {
      await workspaceOperations().deleteFolder(folderId);
      return { folderId, parentFolderId };
    },
    onSuccess: ({ folderId, parentFolderId }) => {
      if (refreshesFolderQueries) {
        void queryClient.invalidateQueries({ queryKey: getFoldersQueryKey(scope) });
        void queryClient.invalidateQueries({ queryKey: getFolderOrderQueryKey(scope) });
      }
      onFolderDeleted(folderId, parentFolderId);
      toast.success('Folder deleted.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to delete folder.'),
  });

  const moveFolderMutation = useWorkspaceMutation(scope, 'move-folder', {
    mutationFn: async (operation: FolderDropOperation) => {
      if (operation.changed) {
        await workspaceOperations().moveFolder(operation);
      }
      return operation;
    },
    onSuccess: () => {
      if (refreshesFolderQueries) {
        void queryClient.invalidateQueries({ queryKey: getFoldersQueryKey(scope) });
        void queryClient.invalidateQueries({ queryKey: getFolderOrderQueryKey(scope) });
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to move folder.'),
  });

  return {
    invalidateCurrentNotes: invalidateCurrentNoteQueries,
    invalidateCurrentFolders: invalidateCurrentFolderQueries,
    updateSettingsMutation,
    submitSettings,
    disconnectHackmdMutation,
    importHackmdCliTokenMutation,
    createNoteMutation,
    createDraftNoteMutation,
    duplicateNoteMutation,
    saveAsTemplateMutation,
    importMarkdownNoteMutation,
    createFolderMutation,
    renameFolderMutation,
    deleteFolderMutation,
    moveFolderMutation,
    moveNoteMutation,
    updateNoteMutation,
    uploadNoteImageMutation,
    deleteNoteMutation,
  };
}
