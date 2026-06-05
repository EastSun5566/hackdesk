import type {
  CreateNoteInput,
  DocumentSummary,
  FolderPathSummary,
  NotePermissionRole,
  NotePublishType,
  NoteSummary,
  RepositoryValue,
  TeamSummary,
  UpdateNoteInput,
  UserSummary,
} from '../../../src/lib/electron-api';

const HACKMD_API_BASE_URL = 'https://api.hackmd.io/v1';
const HACKMD_TIMEOUT_MS = 20_000;

type FolderPathDto = {
  id?: unknown;
  name?: unknown;
  icon?: unknown;
  color?: unknown;
  parentId?: unknown;
  clientId?: unknown;
};

type TeamDto = {
  id?: unknown;
  ownerId?: unknown;
  name?: unknown;
  logo?: unknown;
  path?: unknown;
  description?: unknown;
  visibility?: unknown;
  upgraded?: unknown;
  createdAt?: unknown;
};

type UserDto = {
  id?: unknown;
  email?: unknown;
  name?: unknown;
  userPath?: unknown;
  photo?: unknown;
  teams?: unknown;
  upgraded?: unknown;
};

type NoteDto = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  tags?: unknown;
  lastChangedAt?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  content?: unknown;
  publishLink?: unknown;
  shortId?: unknown;
  permalink?: unknown;
  teamPath?: unknown;
  userPath?: unknown;
  publishType?: unknown;
  readPermission?: unknown;
  writePermission?: unknown;
  folderPaths?: unknown;
};

type CacheKey =
  | 'currentUser'
  | 'teams'
  | 'notes'
  | 'history'
  | `team:${string}:notes`
  | `note:${string}`
  | `team:${string}:note:${string}`;

const memoryCache = new Map<CacheKey, unknown>();

type HackmdFetch = typeof fetch;

type HackmdServiceOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  fetcher?: HackmdFetch;
  readToken?: () => Promise<string>;
};

async function defaultReadHackmdApiToken() {
  const { readHackmdApiToken } = await import('./settings');
  return readHackmdApiToken();
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

export function toMillis(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? toMillis(parsed) : null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value < 10_000_000_000 ? Math.round(value * 1000) : Math.round(value);
}

function toPermission(value: unknown): NotePermissionRole {
  return value === 'owner' || value === 'signed_in' || value === 'guest' ? value : 'owner';
}

function toPublishType(value: unknown): NotePublishType {
  return value === 'edit' || value === 'view' || value === 'slide' || value === 'book'
    ? value
    : 'edit';
}

function toVisibility(value: unknown): TeamSummary['visibility'] {
  return value === 'public' || value === 'private' ? value : 'private';
}

function getJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeHackmdResponse(value: unknown): unknown {
  if (value && typeof value === 'object' && 'note' in value) {
    return value.note;
  }

  return value;
}

export function mapFolderPath(dto: FolderPathDto): FolderPathSummary {
  return {
    id: asString(dto.id),
    name: asString(dto.name, 'Folder'),
    icon: asNullableString(dto.icon),
    color: asNullableString(dto.color),
    parentId: asNullableString(dto.parentId),
    clientId: asNullableString(dto.clientId),
  };
}

export function mapTeam(dto: TeamDto): TeamSummary {
  const id = asString(dto.id, asString(dto.path));
  const path = asString(dto.path, id);

  return {
    id,
    ownerId: asNullableString(dto.ownerId),
    name: asString(dto.name, path || 'Team'),
    logo: asNullableString(dto.logo),
    path,
    description: asNullableString(dto.description),
    visibility: toVisibility(dto.visibility),
    createdAtMillis: toMillis(dto.createdAt),
    upgraded: asBoolean(dto.upgraded),
  };
}

export function mapUser(dto: UserDto): UserSummary {
  const id = asString(dto.id);
  const username = asString(dto.userPath, id);

  return {
    id,
    email: asNullableString(dto.email),
    name: asString(dto.name, username || 'Unknown User'),
    username,
    photo: asNullableString(dto.photo),
    upgraded: asBoolean(dto.upgraded),
    teams: getJsonArray(dto.teams).map((team) => mapTeam(team as TeamDto)),
  };
}

export function mapNote(dto: NoteDto): NoteSummary {
  const id = asString(dto.id);
  const shortId = asString(dto.shortId, id);

  return {
    id,
    title: asString(dto.title, 'Untitled'),
    description: asString(dto.description),
    tags: getJsonArray(dto.tags).filter((tag): tag is string => typeof tag === 'string'),
    updatedAtMillis: toMillis(dto.lastChangedAt ?? dto.updatedAt),
    createdAtMillis: toMillis(dto.createdAt),
    content: typeof dto.content === 'string' ? dto.content : null,
    publishLink: asString(dto.publishLink),
    shortId,
    permalink: asNullableString(dto.permalink),
    teamPath: asNullableString(dto.teamPath),
    userPath: asNullableString(dto.userPath),
    publishType: toPublishType(dto.publishType),
    readPermission: toPermission(dto.readPermission),
    writePermission: toPermission(dto.writePermission),
    folderPaths: getJsonArray(dto.folderPaths).map((folderPath) => mapFolderPath(folderPath as FolderPathDto)),
  };
}

function mapDocument(dto: NoteDto): DocumentSummary {
  const note = mapNote(dto);

  return {
    ...note,
    content: note.content ?? '',
  };
}

export function getHackmdErrorMessage(status: number, statusText: string) {
  if (status === 401) {
    return 'Your HackMD API token is invalid or expired.';
  }

  if (status === 403) {
    return 'Your HackMD API token does not have permission for this action.';
  }

  if (status === 429) {
    return 'HackMD is rate limiting requests right now. Please try again in a moment.';
  }

  if (status >= 500) {
    return 'HackMD is having trouble right now. Please try again in a moment.';
  }

  return `HackMD returned ${status} ${statusText}.`;
}

async function requestHackmd<T>(
  path: string,
  init: RequestInit = {},
  options: Required<HackmdServiceOptions>,
): Promise<T> {
  const token = await options.readToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await options.fetcher(`${options.baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new Error(getHackmdErrorMessage(response.status, response.statusText));
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();

    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('HackMD took too long to respond. Please try again.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function withCache<T>(cacheKey: CacheKey, promise: Promise<T>): Promise<RepositoryValue<T>> {
  return promise
    .then((data) => {
      memoryCache.set(cacheKey, data);
      return { source: 'remote' as const, data };
    })
    .catch((error) => {
      const cached = memoryCache.get(cacheKey) as T | undefined;
      const message = error instanceof Error ? error.message : 'Something went wrong while talking to HackMD.';

      if (cached !== undefined) {
        return { source: 'error' as const, error: message, data: cached };
      }

      return { source: 'error' as const, error: message };
    });
}

export function encodePathSegment(value: string) {
  return encodeURIComponent(value.trim());
}

export function sortNotes(notes: NoteSummary[]) {
  return [...notes].sort((left, right) => (right.updatedAtMillis ?? 0) - (left.updatedAtMillis ?? 0));
}

function createEmptyDocument(input: CreateNoteInput | UpdateNoteInput): DocumentSummary {
  const now = Date.now();

  return {
    id: '',
    title: input.title?.trim() || 'Untitled',
    description: input.description ?? '',
    tags: input.tags ?? [],
    updatedAtMillis: now,
    createdAtMillis: null,
    content: input.content ?? '',
    publishLink: '',
    shortId: '',
    permalink: null,
    teamPath: null,
    userPath: null,
    publishType: 'edit',
    readPermission: input.readPermission ?? 'owner',
    writePermission: input.writePermission ?? 'owner',
    folderPaths: [],
  };
}

export function createHackmdService(options: HackmdServiceOptions = {}) {
  const serviceOptions: Required<HackmdServiceOptions> = {
    baseUrl: options.baseUrl ?? HACKMD_API_BASE_URL,
    timeoutMs: options.timeoutMs ?? HACKMD_TIMEOUT_MS,
    fetcher: options.fetcher ?? fetch,
    readToken: options.readToken ?? defaultReadHackmdApiToken,
  };

  async function createOrUpdateDocument(
    path: string,
    method: 'POST' | 'PATCH',
    input: CreateNoteInput | UpdateNoteInput,
    fetchFallback?: () => Promise<DocumentSummary>,
  ) {
    const response = await requestHackmd<NoteDto | undefined>(path, {
      method,
      body: JSON.stringify(input),
    }, serviceOptions);

    if (!response) {
      return fetchFallback ? fetchFallback() : createEmptyDocument(input);
    }

    return mapDocument(normalizeHackmdResponse(response) as NoteDto);
  }

  return {
    getCurrentUser() {
      return withCache(
        'currentUser',
        requestHackmd<UserDto>('/me', {}, serviceOptions).then(mapUser),
      );
    },

    listTeams() {
      return withCache(
        'teams',
        requestHackmd<TeamDto[]>('/teams', {}, serviceOptions).then((teams) => teams.map(mapTeam)),
      );
    },

    listNotes() {
      return withCache(
        'notes',
        requestHackmd<NoteDto[]>('/notes', {}, serviceOptions).then((notes) => sortNotes(notes.map(mapNote))),
      );
    },

    listHistory(limit = 20) {
      const query = new URLSearchParams({ limit: String(limit) });
      return withCache(
        'history',
        requestHackmd<NoteDto[]>(`/history?${query.toString()}`, {}, serviceOptions)
          .then((notes) => sortNotes(notes.map(mapNote))),
      );
    },

    listTeamNotes(teamPath: string) {
      const normalizedTeamPath = teamPath.trim();
      return withCache(
        `team:${normalizedTeamPath}:notes`,
        requestHackmd<NoteDto[]>(`/teams/${encodePathSegment(normalizedTeamPath)}/notes`, {}, serviceOptions)
          .then((notes) => sortNotes(notes.map(mapNote))),
      );
    },

    getNote(noteId: string, teamPath?: string | null) {
      const normalizedNoteId = encodePathSegment(noteId);
      const normalizedTeamPath = teamPath?.trim();
      const path = normalizedTeamPath
        ? `/teams/${encodePathSegment(normalizedTeamPath)}/notes/${normalizedNoteId}`
        : `/notes/${normalizedNoteId}`;
      const cacheKey: CacheKey = normalizedTeamPath
        ? `team:${normalizedTeamPath}:note:${noteId}`
        : `note:${noteId}`;

      return withCache(
        cacheKey,
        requestHackmd<NoteDto>(path, {}, serviceOptions)
          .then((response) => mapDocument(normalizeHackmdResponse(response) as NoteDto)),
      );
    },

    createNote(input: CreateNoteInput) {
      return createOrUpdateDocument('/notes', 'POST', input);
    },

    createTeamNote(teamPath: string, input: CreateNoteInput) {
      return createOrUpdateDocument(`/teams/${encodePathSegment(teamPath)}/notes`, 'POST', input);
    },

    updateNote(noteId: string, input: UpdateNoteInput) {
      return createOrUpdateDocument(
        `/notes/${encodePathSegment(noteId)}`,
        'PATCH',
        input,
        async () => {
          const response = await requestHackmd<NoteDto>(
            `/notes/${encodePathSegment(noteId)}`,
            {},
            serviceOptions,
          );
          return mapDocument(normalizeHackmdResponse(response) as NoteDto);
        },
      );
    },

    updateTeamNote(teamPath: string, noteId: string, input: UpdateNoteInput) {
      const path = `/teams/${encodePathSegment(teamPath)}/notes/${encodePathSegment(noteId)}`;
      return createOrUpdateDocument(
        path,
        'PATCH',
        input,
        async () => {
          const response = await requestHackmd<NoteDto>(path, {}, serviceOptions);
          return mapDocument(normalizeHackmdResponse(response) as NoteDto);
        },
      );
    },

    async deleteNote(noteId: string) {
      await requestHackmd<void>(`/notes/${encodePathSegment(noteId)}`, { method: 'DELETE' }, serviceOptions);
      memoryCache.delete('notes');
      memoryCache.delete(`note:${noteId}`);
    },

    async deleteTeamNote(teamPath: string, noteId: string) {
      await requestHackmd<void>(`/teams/${encodePathSegment(teamPath)}/notes/${encodePathSegment(noteId)}`, {
        method: 'DELETE',
      }, serviceOptions);
      memoryCache.delete(`team:${teamPath}:notes`);
      memoryCache.delete(`team:${teamPath}:note:${noteId}`);
    },
  };
}

const defaultHackmdService = createHackmdService();

export const getCurrentUser = defaultHackmdService.getCurrentUser;
export const listTeams = defaultHackmdService.listTeams;
export const listNotes = defaultHackmdService.listNotes;
export const listHistory = defaultHackmdService.listHistory;
export const listTeamNotes = defaultHackmdService.listTeamNotes;
export const getNote = defaultHackmdService.getNote;
export const createNote = defaultHackmdService.createNote;
export const createTeamNote = defaultHackmdService.createTeamNote;
export const updateNote = defaultHackmdService.updateNote;
export const updateTeamNote = defaultHackmdService.updateTeamNote;
export const deleteNote = defaultHackmdService.deleteNote;
export const deleteTeamNote = defaultHackmdService.deleteTeamNote;
