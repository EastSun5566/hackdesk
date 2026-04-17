import { invoke } from '@tauri-apps/api/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppSettings } from './settings';

const HACKMD_QUERY_KEY = ['hackmd'] as const;
const HACKMD_NOTES_QUERY_KEY = [...HACKMD_QUERY_KEY, 'notes'] as const;

export type HackmdPublishType = 'edit' | 'view' | 'slide' | 'book';
export type HackmdPermissionRole = 'owner' | 'signed_in' | 'guest';

export type HackmdSimpleUserProfile = {
  name: string;
  userPath: string;
  photo: string;
  biography: string | null;
};

export type HackmdCreateNoteInput = {
  title: string;
  content: string;
};

export type HackmdNote = {
  id: string;
  title: string;
  tags: string[];
  lastChangedAt: string;
  createdAt: string;
  lastChangeUser: HackmdSimpleUserProfile | null;
  publishType: HackmdPublishType;
  publishedAt: string | null;
  userPath: string | null;
  teamPath: string | null;
  permalink: string | null;
  shortId: string;
  publishLink: string;
  readPermission: HackmdPermissionRole;
  writePermission: HackmdPermissionRole;
};

export type HackmdSingleNote = HackmdNote & {
  content: string;
};

export type HackmdUserProfile = {
  id: string;
  email: string | null;
  name: string;
  userPath: string;
  photo: string;
  upgraded: boolean;
};

const noteModeAlias: Record<HackmdNote['publishType'], string> = {
  edit: '',
  view: 's',
  slide: 'p',
  book: 'c',
};

export function normalizeHackmdToken(token?: string | null) {
  return token?.trim() ?? '';
}

export function hasHackmdToken(settings: Pick<AppSettings, 'hackmdApiToken'>) {
  return normalizeHackmdToken(settings.hackmdApiToken).length > 0;
}

async function invokeHackmdCommand<T>(command: string, args?: Record<string, unknown>) {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new Error(getHackmdErrorMessage(error));
  }
}

export function getHackmdErrorMessage(error: unknown, fallback = 'Something went wrong while talking to HackMD.') {
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'number') {
    if (error.code === 401) {
      return 'Your HackMD API token is invalid or expired.';
    }

    if (error.code === 429) {
      return 'HackMD is rate limiting requests right now. Please try again in a moment.';
    }
  }

  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function getHackmdNotePath(note: Pick<HackmdNote, 'publishType' | 'shortId' | 'userPath' | 'teamPath' | 'permalink'>, editMode = false) {
  const namePath = note.userPath || note.teamPath;

  if (namePath) {
    const basePath = `/@${namePath}/${note.permalink || note.shortId}`;
    return editMode ? `${basePath}/edit` : basePath;
  }

  if (editMode) {
    return `/${note.shortId}`;
  }

  const mode = noteModeAlias[note.publishType];
  return mode ? `/${mode}/${note.shortId}` : `/${note.shortId}`;
}

export function createQuickNotePayload(title: string): HackmdCreateNoteInput {
  const normalizedTitle = title.trim();

  return {
    title: normalizedTitle,
    content: `# ${normalizedTitle}\n\n`,
  };
}

export function useValidateHackmdToken() {
  return useMutation({
    mutationFn: async (accessToken: string) => {
      return invokeHackmdCommand<HackmdUserProfile>('validate_hackmd_token', {
        token: normalizeHackmdToken(accessToken),
      });
    },
  });
}

export function useHackmdNotes(accessToken: string, enabled: boolean) {
  return useQuery({
    queryKey: [...HACKMD_NOTES_QUERY_KEY, normalizeHackmdToken(accessToken)],
    queryFn: async () => {
      const notes = await invokeHackmdCommand<HackmdNote[]>('list_hackmd_notes');
      return [...notes].sort(
        (left, right) => new Date(right.lastChangedAt).valueOf() - new Date(left.lastChangedAt).valueOf(),
      );
    },
    enabled: enabled && normalizeHackmdToken(accessToken).length > 0,
    staleTime: 1000 * 60,
    retry: 1,
  });
}

export function useCreateHackmdNote(_accessToken: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (title: string) => {
      return invokeHackmdCommand<HackmdNote>('create_hackmd_note', {
        payload: createQuickNotePayload(title),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HACKMD_NOTES_QUERY_KEY });
    },
  });
}

export function useDeleteHackmdNote(_accessToken: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string) => {
      return invokeHackmdCommand<void>('delete_hackmd_note', {
        noteId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HACKMD_NOTES_QUERY_KEY });
    },
  });
}