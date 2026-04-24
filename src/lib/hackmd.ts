import { invoke } from '@tauri-apps/api/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AppSettings } from './settings';

const HACKMD_QUERY_KEY = ['hackmd'] as const;
const HACKMD_PROFILE_QUERY_KEY = [...HACKMD_QUERY_KEY, 'profile'] as const;
const HACKMD_NOTES_QUERY_KEY = [...HACKMD_QUERY_KEY, 'notes'] as const;
const HACKMD_TEAMS_QUERY_KEY = [...HACKMD_QUERY_KEY, 'teams'] as const;

export type HackmdPublishType = 'edit' | 'view' | 'slide' | 'book';
export type HackmdPermissionRole = 'owner' | 'signed_in' | 'guest';
export type HackmdTeamVisibility = 'public' | 'private';

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

export type HackmdTeam = {
  id: string;
  ownerId: string | null;
  name: string;
  logo: string;
  path: string;
  description: string | null;
  visibility: HackmdTeamVisibility;
  createdAt: string;
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

export function getHackmdProfilePath(userPath?: string | null) {
  const normalizedUserPath = userPath?.trim() ?? '';

  return normalizedUserPath ? `/@${normalizedUserPath}` : null;
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

function getHackmdPathFromPublishLink(publishLink?: string | null) {
  if (!publishLink) {
    return null;
  }

  try {
    const url = new URL(publishLink);

    if (url.origin !== 'https://hackmd.io') {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function getHackmdNotePath(note: Pick<HackmdNote, 'publishType' | 'shortId' | 'userPath' | 'teamPath' | 'permalink' | 'publishLink'>, editMode = false) {
  if (note.teamPath) {
    const publishPath = getHackmdPathFromPublishLink(note.publishLink);

    if (publishPath) {
      return editMode ? `${publishPath.replace(/\/edit$/, '')}/edit` : publishPath;
    }
  }

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

export function useHackmdProfile(accessToken: string, enabled: boolean) {
  const normalizedAccessToken = normalizeHackmdToken(accessToken);

  return useQuery({
    queryKey: [...HACKMD_PROFILE_QUERY_KEY, normalizedAccessToken],
    queryFn: async () => {
      return invokeHackmdCommand<HackmdUserProfile>('validate_hackmd_token', {
        token: normalizedAccessToken,
      });
    },
    enabled: enabled && normalizedAccessToken.length > 0,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

export function useHackmdTeams(enabled: boolean) {
  return useQuery({
    queryKey: HACKMD_TEAMS_QUERY_KEY,
    queryFn: async () => {
      return invokeHackmdCommand<HackmdTeam[]>('list_hackmd_teams');
    },
    enabled,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

export function useHackmdNotes(accessToken: string, enabled: boolean, teamPath?: string | null) {
  const normalizedTeamPath = teamPath?.trim() || null;

  return useQuery({
    queryKey: [...HACKMD_NOTES_QUERY_KEY, normalizeHackmdToken(accessToken), normalizedTeamPath],
    queryFn: async () => {
      const notes = normalizedTeamPath
        ? await invokeHackmdCommand<HackmdNote[]>('list_hackmd_team_notes', { teamPath: normalizedTeamPath })
        : await invokeHackmdCommand<HackmdNote[]>('list_hackmd_notes');

      return [...notes].sort(
        (left, right) => new Date(right.lastChangedAt).valueOf() - new Date(left.lastChangedAt).valueOf(),
      );
    },
    enabled: enabled && normalizeHackmdToken(accessToken).length > 0,
    staleTime: 1000 * 60,
    retry: 1,
  });
}

export function useCreateHackmdNote(_accessToken: string, teamPath?: string | null) {
  const queryClient = useQueryClient();
  const normalizedTeamPath = teamPath?.trim() || null;

  return useMutation({
    mutationFn: async (title: string) => {
      return normalizedTeamPath
        ? invokeHackmdCommand<HackmdNote>('create_hackmd_team_note', {
          teamPath: normalizedTeamPath,
          payload: createQuickNotePayload(title),
        })
        : invokeHackmdCommand<HackmdNote>('create_hackmd_note', {
          payload: createQuickNotePayload(title),
        });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HACKMD_NOTES_QUERY_KEY });
    },
  });
}

export function useDeleteHackmdNote(_accessToken: string, teamPath?: string | null) {
  const queryClient = useQueryClient();
  const normalizedTeamPath = teamPath?.trim() || null;

  return useMutation({
    mutationFn: async (noteId: string) => {
      return normalizedTeamPath
        ? invokeHackmdCommand<void>('delete_hackmd_team_note', {
          teamPath: normalizedTeamPath,
          noteId,
        })
        : invokeHackmdCommand<void>('delete_hackmd_note', {
          noteId,
        });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: HACKMD_NOTES_QUERY_KEY });
    },
  });
}