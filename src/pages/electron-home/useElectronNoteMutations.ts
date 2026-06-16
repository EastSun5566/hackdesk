import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type {
  CreateFolderInput,
  DocumentSummary,
  FolderOrder,
  FolderSummary,
  HackDeskElectronAPI,
  NoteSummary,
  UpdateFolderInput,
  UpdateNoteInput,
  UploadNoteImageInput,
} from '@/lib/electron-api';
import type { FolderDropOperation } from '@/lib/hackmd-folder-dnd';

import {
  getFoldersQueryKey,
  getFolderOrderQueryKey,
  getWorkspaceQueryKey,
} from './repository';
import type { SettingsFormInput, WorkspaceScope } from './types';
import { createQuickNoteContent } from './ui';

export function useElectronNoteMutations({
  api,
  scope,
  selectedNote,
  selectedParentFolderId,
  onSettingsSaved,
  onNoteCreated,
  onFolderCreated,
  onFolderRenamed,
  onFolderDeleted,
  onNoteDeleted,
  onNoteMoved,
}: {
  api?: HackDeskElectronAPI;
  scope: WorkspaceScope;
  selectedNote: NoteSummary | null;
  selectedParentFolderId?: string;
  onSettingsSaved: () => void;
  onNoteCreated: (note: NoteSummary) => void;
  onFolderCreated: (folder: FolderSummary) => void;
  onFolderRenamed: (folder: FolderSummary) => void;
  onFolderDeleted: (folderId: string, parentFolderId: string | null) => void;
  onNoteDeleted: () => void;
  onNoteMoved: (note: NoteSummary, targetFolderId: string | null) => void;
}) {
  const queryClient = useQueryClient();

  const invalidateCurrentNotes = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: getWorkspaceQueryKey(scope) });
    if (selectedNote) {
      void queryClient.invalidateQueries({
        queryKey: ['electron', 'hackmd', 'note', selectedNote.teamPath ?? null, selectedNote.id],
      });
    }
  }, [queryClient, scope, selectedNote]);

  const invalidateCurrentFolders = useCallback(() => {
    if (scope.type !== 'history') {
      void queryClient.invalidateQueries({ queryKey: getFoldersQueryKey(scope) });
      void queryClient.invalidateQueries({ queryKey: getFolderOrderQueryKey(scope) });
    }
  }, [queryClient, scope]);

  const updateFolder = useCallback((folderId: string, input: UpdateFolderInput) => {
    if (!api) {
      throw new Error('Electron API is unavailable.');
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
      return scope.type === 'team'
        ? api.hackmd.createTeamNote(scope.teamPath, input)
        : api.hackmd.createNote(input);
    },
    onSuccess: (createdNote) => {
      invalidateCurrentNotes();
      onNoteCreated(createdNote);
      toast.success('Note created.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create note.'),
  });

  const createFolderMutation = useMutation({
    mutationFn: async (input: CreateFolderInput) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      if (scope.type === 'history') {
        throw new Error('Choose My Workspace or a team before creating a folder.');
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
      invalidateCurrentFolders();
      onFolderCreated(createdFolder);
      toast.success('Folder created.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to create folder.'),
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ note, input }: { note: DocumentSummary; input: UpdateNoteInput }) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      const payload = {
        ...input,
        ...(input.title !== undefined ? { title: input.title.trim() || 'Untitled' } : {}),
      };

      return note.teamPath
        ? api.hackmd.updateTeamNote(note.teamPath, note.id, payload)
        : api.hackmd.updateNote(note.id, payload);
    },
    onSuccess: (updatedNote) => {
      onNoteCreated(updatedNote);
      invalidateCurrentNotes();
      toast.success('Note saved.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to save note.'),
  });

  const uploadNoteImageMutation = useMutation({
    mutationFn: ({ note, input }: { note: DocumentSummary; input: UploadNoteImageInput }) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      return api.hackmd.uploadNoteImage(note.id, input);
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (note: DocumentSummary) => {
      if (!api) {
        throw new Error('Electron API is unavailable.');
      }

      if (note.teamPath) {
        await api.hackmd.deleteTeamNote(note.teamPath, note.id);
      } else {
        await api.hackmd.deleteNote(note.id);
      }
    },
    onSuccess: () => {
      onNoteDeleted();
      invalidateCurrentNotes();
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

      const input = { parentFolderId: targetFolderId };
      const movedNote = scope.type === 'team'
        ? await api.hackmd.updateTeamNote(scope.teamPath, note.id, input)
        : await api.hackmd.updateNote(note.id, input);

      return { note: movedNote, targetFolderId };
    },
    onSuccess: ({ note, targetFolderId }) => {
      invalidateCurrentNotes();
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

      return updateFolder(folderId, {
        ...input,
        name: nextName,
      });
    },
    onSuccess: (updatedFolder) => {
      invalidateCurrentFolders();
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
      invalidateCurrentFolders();
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

      if (operation.parentChanged) {
        await updateFolder(operation.folderId, { parentFolderId: operation.parentFolderId });
      }
      if (operation.orderChanged) {
        await updateFolderOrder(operation.order);
      }

      return operation;
    },
    onSuccess: () => {
      invalidateCurrentFolders();
      toast.success('Folder moved.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to move folder.'),
  });

  return {
    invalidateCurrentNotes,
    invalidateCurrentFolders,
    updateSettingsMutation,
    createNoteMutation,
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
