import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/components/ui/toast';

import type {
  CreateFolderInput,
  CreateNoteInput,
  DocumentSummary,
  FolderOrder,
  FolderSummary,
  HackDeskElectronAPI,
  NoteSummary,
  RepositoryValue,
  UpdateFolderInput,
  UpdateNoteInput,
  UploadNoteImageInput,
} from '@/lib/electron-api';
import type { LocalDocument } from '@/lib/local-vault';
import type { FolderDropOperation } from '@/lib/hackmd-folder-dnd';

import {
  getLocalFolderPathFromFolderId,
  LOCAL_VAULT_TEAM_PATH,
  toDocumentSummary,
  toFolderSummary,
  toNoteSummary,
  type LocalDocumentSummary,
} from './local-vault-adapter';
import { getLocalVaultDocumentQueryKey, getLocalVaultSnapshotQueryKey } from './useElectronLocalVault';
import {
  getFoldersQueryKey,
  getFolderOrderQueryKey,
  getWorkspaceQueryKey,
} from './repository';
import type { NoteIdentity } from './note-workspace';
import type { SettingsFormInput, WorkspaceScope } from './types';
import { createQuickNoteContent } from './ui';

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
  onNoteSaved,
  onFolderCreated,
  onFolderRenamed,
  onFolderDeleted,
  onNoteDeleted,
  onNoteMoved,
}: {
  api?: HackDeskElectronAPI;
  scope: WorkspaceScope;
  selectedNote: NoteIdentity | null;
  selectedParentFolderId?: string;
  onSettingsSaved: () => void;
  onNoteCreated: (note: NoteSummary) => void;
  onNoteSaved: (note: NoteSummary) => void;
  onFolderCreated: (folder: FolderSummary) => void;
  onFolderRenamed: (folder: FolderSummary) => void;
  onFolderDeleted: (folderId: string, parentFolderId: string | null) => void;
  onNoteDeleted: (note: DocumentSummary) => void;
  onNoteMoved: (note: NoteSummary, targetFolderId: string | null) => void;
}) {
  const queryClient = useQueryClient();

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
    if (scope.type !== 'history') {
      void queryClient.invalidateQueries({ queryKey: getFoldersQueryKey(scope) });
      void queryClient.invalidateQueries({ queryKey: getFolderOrderQueryKey(scope) });
    }
  }, [queryClient, scope]);

  const updateFolder = useCallback((folderId: string, input: UpdateFolderInput) => {
    if (!api) {
      throw new Error('Electron API is unavailable.');
    }

    if (scope.type === 'local') {
      throw new Error('Local folders are managed on disk.');
    }

    if (scope.type === 'history') {
      throw new Error('Choose My Workspace or a team before changing folders.');
    }

    return scope.type === 'team'
      ? api.hackmd.updateTeamFolder(scope.teamPath, folderId, input)
      : api.hackmd.updateFolder(folderId, input);
  }, [api, scope]);

  const updateFolderOrder = useCallback((order: FolderOrder) => {
    if (!api) {
      throw new Error('Electron API is unavailable.');
    }

    if (scope.type === 'local') {
      throw new Error('Local folders are ordered by file name.');
    }

    if (scope.type === 'history') {
      throw new Error('Choose My Workspace or a team before changing folder order.');
    }

    return scope.type === 'team'
      ? api.hackmd.updateTeamFolderOrder(scope.teamPath, order)
      : api.hackmd.updateFolderOrder(order);
  }, [api, scope]);

  const updateSettingsMutation = useMutation({
    mutationFn: (input: SettingsFormInput) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      return api.settings.update(input);
    },
    onSuccess: (nextSettings) => {
      queryClient.setQueryData(['electron', 'settings'], nextSettings);
      void queryClient.invalidateQueries({ queryKey: ['electron', 'hackmd'] });
      onSettingsSaved();
      toast.success('Settings saved.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to save settings.'),
  });

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

  const createNoteMutation = useMutation({
    mutationFn: async (title: string) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      const input = {
        title,
        content: createQuickNoteContent(title),
        ...(selectedParentFolderId ? { parentFolderId: selectedParentFolderId } : {}),
      };
      if (scope.type === 'local') {
        const createdDocument = await api.localVault.createNote({
          title,
          content: createQuickNoteContent(title),
          parentPath: getLocalFolderPathFromFolderId(selectedParentFolderId),
        });
        const snapshot = await api.localVault.getSnapshot();
        if (!snapshot) {
          throw new Error('Local vault snapshot is unavailable.');
        }

        return toDocumentSummary(createdDocument, snapshot);
      }

      return scope.type === 'team'
        ? api.hackmd.createTeamNote(scope.teamPath, input)
        : api.hackmd.createNote(input);
    },
    onSuccess: (createdNote) => {
      if (scope.type === 'local') {
        void queryClient.invalidateQueries({ queryKey: getLocalVaultSnapshotQueryKey() });
      } else {
        seedWorkspaceNote(createdNote);
      }
      onNoteCreated(createdNote);
      void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope), refetchType: 'inactive' });
      toast.success('Note created.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create note.'),
  });

  const duplicateNoteMutation = useMutation({
    mutationFn: async (note: NoteSummary) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      if (scope.type === 'history') {
        throw new Error('Choose My Workspace or a team before duplicating notes.');
      }

      if (scope.type === 'local') {
        const sourceDocument = await api.localVault.readNote(note.id);
        const createdDocument = await api.localVault.createNote({
          title: `Copy of ${sourceDocument.title.trim() || 'Untitled'}`,
          content: sourceDocument.content,
          parentPath: sourceDocument.parentPath,
        });
        const snapshot = await api.localVault.getSnapshot();
        if (!snapshot) {
          throw new Error('Local vault snapshot is unavailable.');
        }

        return toDocumentSummary(createdDocument, snapshot);
      }

      const documentResult = await api.hackmd.getNote(note.id, note.teamPath ?? null);
      if (documentResult.source === 'error') {
        throw new Error(documentResult.error);
      }

      const sourceDocument = documentResult.data;
      const parentFolderId = sourceDocument.folderPaths.at(-1)?.id;
      const input = {
        title: `Copy of ${sourceDocument.title.trim() || 'Untitled'}`,
        content: sourceDocument.content,
        description: sourceDocument.description,
        tags: sourceDocument.tags,
        readPermission: sourceDocument.readPermission,
        writePermission: sourceDocument.writePermission,
        ...(parentFolderId ? { parentFolderId } : {}),
      };

      return scope.type === 'team'
        ? api.hackmd.createTeamNote(scope.teamPath, input)
        : api.hackmd.createNote(input);
    },
    onSuccess: (createdNote) => {
      if (scope.type === 'local') {
        void queryClient.invalidateQueries({ queryKey: getLocalVaultSnapshotQueryKey() });
      } else {
        seedWorkspaceNote(createdNote);
      }
      onNoteCreated(createdNote);
      void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope), refetchType: 'inactive' });
      toast.success('Note duplicated.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to duplicate note.'),
  });

  const importMarkdownNoteMutation = useMutation({
    mutationFn: async (input: CreateNoteInput) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      if (scope.type === 'history') {
        throw new Error('Choose My Workspace or a team before importing notes.');
      }

      if (scope.type === 'local') {
        const createdDocument = await api.localVault.createNote({
          title: input.title,
          content: input.content,
          parentPath: getLocalFolderPathFromFolderId(selectedParentFolderId),
        });
        const snapshot = await api.localVault.getSnapshot();
        if (!snapshot) {
          throw new Error('Local vault snapshot is unavailable.');
        }

        return toDocumentSummary(createdDocument, snapshot);
      }

      return scope.type === 'team'
        ? api.hackmd.createTeamNote(scope.teamPath, input)
        : api.hackmd.createNote(input);
    },
    onSuccess: (createdNote) => {
      if (scope.type === 'local') {
        void queryClient.invalidateQueries({ queryKey: getLocalVaultSnapshotQueryKey() });
      } else {
        seedWorkspaceNote(createdNote);
      }
      onNoteCreated(createdNote);
      void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope), refetchType: 'inactive' });
      toast.success('Markdown note imported.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to import markdown note.'),
  });

  const createFolderMutation = useMutation({
    mutationFn: async (input: CreateFolderInput) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      if (scope.type === 'history') {
        throw new Error('Choose My Workspace or a team before creating a folder.');
      }

      if (scope.type === 'local') {
        const snapshot = await api.localVault.createFolder({
          name: input.name,
          parentPath: getLocalFolderPathFromFolderId(selectedParentFolderId),
        });
        const createdFolder = snapshot.folders
          .map(toFolderSummary)
          .find((folder) => folder.name === input.name.trim())
          ?? snapshot.folders.map(toFolderSummary).at(-1);
        if (!createdFolder) {
          throw new Error('Local folder was created but could not be indexed.');
        }

        return createdFolder;
      }

      const payload = {
        ...input,
        ...(selectedParentFolderId ? { parentFolderId: selectedParentFolderId } : {}),
      };
      return scope.type === 'team'
        ? api.hackmd.createTeamFolder(scope.teamPath, payload)
        : api.hackmd.createFolder(payload);
    },
    onSuccess: (createdFolder) => {
      if (scope.type === 'local') {
        void queryClient.invalidateQueries({ queryKey: getLocalVaultSnapshotQueryKey() });
      } else if (scope.type !== 'history') {
        void queryClient.invalidateQueries({ queryKey: getFoldersQueryKey(scope) });
        void queryClient.invalidateQueries({ queryKey: getFolderOrderQueryKey(scope) });
      }
      onFolderCreated(createdFolder);
      toast.success('Folder created.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create folder.'),
  });

  const updateNoteMutation = useMutation({
    mutationFn: async (variables: { note: DocumentSummary; input: UpdateNoteInput; successMessage?: string }) => {
      const { note, input } = variables;
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      const payload = {
        ...input,
        ...(input.title !== undefined ? { title: input.title.trim() || 'Untitled' } : {}),
      };

      if (scope.type === 'local' || note.teamPath === LOCAL_VAULT_TEAM_PATH) {
        let localDocument = note as LocalDocumentSummary;
        if (payload.title !== undefined && payload.title !== note.title) {
          const renamed = await api.localVault.renameNote({
            noteId: note.id,
            title: payload.title,
            expectedRevision: localDocument.localRevision,
          });
          const snapshot = await api.localVault.getSnapshot();
          if (!snapshot) {
            throw new Error('Local vault snapshot is unavailable.');
          }
          localDocument = toDocumentSummary(renamed, snapshot);
        }

        if (payload.content !== undefined) {
          const written = await api.localVault.writeNote({
            noteId: note.id,
            content: payload.content,
            expectedRevision: localDocument.localRevision,
          });
          const snapshot = await api.localVault.getSnapshot();
          if (!snapshot) {
            throw new Error('Local vault snapshot is unavailable.');
          }
          localDocument = toDocumentSummary(written, snapshot);
        }

        return localDocument;
      }

      return note.teamPath
        ? api.hackmd.updateTeamNote(note.teamPath, note.id, payload)
        : api.hackmd.updateNote(note.id, payload);
    },
    onSuccess: (updatedNote, variables) => {
      onNoteSaved(updatedNote);
      if (scope.type === 'local' || updatedNote.teamPath === LOCAL_VAULT_TEAM_PATH) {
        queryClient.setQueryData<LocalDocument | undefined>(
          getLocalVaultDocumentQueryKey(updatedNote.id),
          (current) => localDocumentFromSummary(current, updatedNote as LocalDocumentSummary),
        );
        void queryClient.invalidateQueries({ queryKey: getLocalVaultSnapshotQueryKey() });
      } else {
        queryClient.setQueryData<RepositoryValue<NoteSummary[]> | undefined>(
          getWorkspaceQueryKey(scope),
          (current) => upsertNoteInRepositoryValue(current, updatedNote),
        );
        queryClient.setQueryData<RepositoryValue<DocumentSummary> | undefined>(
          ['electron', 'hackmd', 'note', variables.note.teamPath ?? null, variables.note.id],
          (current) => repositoryDocumentValue(current, updatedNote),
        );
      }
      toast.success(variables.successMessage ?? 'Note saved.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to save note.'),
  });

  const uploadNoteImageMutation = useMutation({
    mutationFn: ({ note, input }: { note: DocumentSummary; input: UploadNoteImageInput }) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      if (scope.type === 'local' || note.teamPath === LOCAL_VAULT_TEAM_PATH) {
        return api.localVault.importAttachment({
          noteId: note.id,
          ...input,
        });
      }

      return api.hackmd.uploadNoteImage(note.id, input);
    },
    onSuccess: (_uploadedImage, { note }) => {
      if (scope.type === 'local' || note.teamPath === LOCAL_VAULT_TEAM_PATH) {
        void queryClient.invalidateQueries({ queryKey: getLocalVaultSnapshotQueryKey() });
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: ['electron', 'hackmd', 'note', note.teamPath ?? null, note.id],
      });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (note: DocumentSummary) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      if (scope.type === 'local' || note.teamPath === LOCAL_VAULT_TEAM_PATH) {
        await api.localVault.trashNote({ noteId: note.id });
      } else if (note.teamPath) {
        await api.hackmd.deleteTeamNote(note.teamPath, note.id);
      } else {
        await api.hackmd.deleteNote(note.id);
      }

      return note;
    },
    onSuccess: (note) => {
      if (scope.type === 'local') {
        void queryClient.invalidateQueries({ queryKey: getLocalVaultSnapshotQueryKey() });
      } else {
        queryClient.setQueryData<RepositoryValue<NoteSummary[]> | undefined>(
          getWorkspaceQueryKey(scope),
          (current) => removeNoteFromRepositoryValue(current, note),
        );
      }
      onNoteDeleted(note);
      if (scope.type !== 'local') {
        void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope) });
        void queryClient.invalidateQueries({
          queryKey: ['electron', 'hackmd', 'note', note.teamPath ?? null, note.id],
        });
      }
      toast.success('Note deleted.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to delete note.'),
  });

  const moveNoteMutation = useMutation({
    mutationFn: async ({ note, targetFolderId }: { note: NoteSummary; targetFolderId: string | null }) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      if (scope.type === 'history') {
        throw new Error('Choose My Workspace or a team before moving notes.');
      }

      if (scope.type === 'local') {
        const document = await api.localVault.readNote(note.id);
        const movedDocument = await api.localVault.moveNote({
          noteId: note.id,
          parentPath: getLocalFolderPathFromFolderId(targetFolderId),
          expectedRevision: document.revision,
        });
        const snapshot = await api.localVault.getSnapshot();
        if (!snapshot) {
          throw new Error('Local vault snapshot is unavailable.');
        }

        return { note: toNoteSummary(movedDocument, snapshot), targetFolderId };
      }

      const input = { parentFolderId: targetFolderId };
      const movedNote = scope.type === 'team'
        ? await api.hackmd.updateTeamNote(scope.teamPath, note.id, input)
        : await api.hackmd.updateNote(note.id, input);

      return { note: movedNote, targetFolderId };
    },
    onSuccess: ({ note, targetFolderId }) => {
      if (scope.type === 'local') {
        void queryClient.invalidateQueries({ queryKey: getLocalVaultSnapshotQueryKey() });
        void queryClient.invalidateQueries({ queryKey: getLocalVaultDocumentQueryKey(note.id) });
      } else {
        void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope) });
        void queryClient.invalidateQueries({
          queryKey: ['electron', 'hackmd', 'note', note.teamPath ?? null, note.id],
        });
      }
      onNoteMoved(note, targetFolderId);
      toast.success('Note moved.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to move note.'),
  });

  const renameFolderMutation = useMutation({
    mutationFn: async ({ folderId, input }: { folderId: string; input: UpdateFolderInput }) => {
      const name = input.name ?? '';
      const nextName = name.trim();
      if (!nextName) {
        throw new Error('Folder name is required.');
      }

      if (scope.type === 'local') {
        if (!api) {
          throw new Error('Electron API is unavailable.');
        }

        const snapshot = await api.localVault.renameFolder({
          relativePath: getLocalFolderPathFromFolderId(folderId) ?? folderId,
          name: nextName,
        });
        const updatedFolder = snapshot.folders
          .map(toFolderSummary)
          .find((folder) => folder.name === nextName);
        if (!updatedFolder) {
          throw new Error('Local folder was renamed but could not be indexed.');
        }

        return updatedFolder;
      }

      return updateFolder(folderId, {
        ...input,
        name: nextName,
      });
    },
    onSuccess: (updatedFolder) => {
      if (scope.type === 'local') {
        void queryClient.invalidateQueries({ queryKey: getLocalVaultSnapshotQueryKey() });
      } else if (scope.type !== 'history') {
        void queryClient.invalidateQueries({ queryKey: getFoldersQueryKey(scope) });
        void queryClient.invalidateQueries({ queryKey: getFolderOrderQueryKey(scope) });
      }
      onFolderRenamed(updatedFolder);
      toast.success('Folder renamed.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to rename folder.'),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async ({ folderId, parentFolderId }: { folderId: string; parentFolderId: string | null }) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      if (scope.type === 'local') {
        await api.localVault.trashFolder({
          relativePath: getLocalFolderPathFromFolderId(folderId) ?? folderId,
        });
        return { folderId, parentFolderId };
      }

      if (scope.type === 'history') {
        throw new Error('Choose My Workspace or a team before deleting folders.');
      }

      if (scope.type === 'team') {
        await api.hackmd.deleteTeamFolder(scope.teamPath, folderId);
      } else {
        await api.hackmd.deleteFolder(folderId);
      }

      return { folderId, parentFolderId };
    },
    onSuccess: ({ folderId, parentFolderId }) => {
      if (scope.type === 'local') {
        void queryClient.invalidateQueries({ queryKey: getLocalVaultSnapshotQueryKey() });
      } else if (scope.type !== 'history') {
        void queryClient.invalidateQueries({ queryKey: getFoldersQueryKey(scope) });
        void queryClient.invalidateQueries({ queryKey: getFolderOrderQueryKey(scope) });
      }
      onFolderDeleted(folderId, parentFolderId);
      toast.success('Folder deleted.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to delete folder.'),
  });

  const moveFolderMutation = useMutation({
    mutationFn: async (operation: FolderDropOperation) => {
      if (!operation.changed) {
        return operation;
      }

      if (scope.type === 'local') {
        if (operation.parentChanged) {
          await api?.localVault.moveFolder({
            relativePath: getLocalFolderPathFromFolderId(operation.folderId) ?? operation.folderId,
            parentPath: getLocalFolderPathFromFolderId(operation.parentFolderId),
          });
        }

        return operation;
      }

      if (operation.parentChanged) {
        await updateFolder(operation.folderId, { parentFolderId: operation.parentFolderId });
      }
      if (operation.orderChanged) {
        await updateFolderOrder(operation.order);
      }

      return operation;
    },
    onSuccess: () => {
      if (scope.type === 'local') {
        void queryClient.invalidateQueries({ queryKey: getLocalVaultSnapshotQueryKey() });
      } else if (scope.type !== 'history') {
        void queryClient.invalidateQueries({ queryKey: getFoldersQueryKey(scope) });
        void queryClient.invalidateQueries({ queryKey: getFolderOrderQueryKey(scope) });
      }
      toast.success('Folder moved.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to move folder.'),
  });

  return {
    invalidateCurrentNotes: invalidateCurrentNoteQueries,
    invalidateCurrentFolders: invalidateCurrentFolderQueries,
    updateSettingsMutation,
    importHackmdCliTokenMutation,
    createNoteMutation,
    duplicateNoteMutation,
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
