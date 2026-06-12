import type {
  CreateNoteInput,
  DocumentSummary,
  CreateFolderInput,
  FolderOrder,
  FolderPathSummary,
  FolderSummary,
  NotePermissionRole,
  NotePublishType,
  NoteSummary,
  RepositoryValue,
  SimpleUserProfile,
  TeamSummary,
  UpdateFolderInput,
  UpdateNoteInput,
  UploadNoteImageInput,
  UploadNoteImageResult,
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

type FolderDto = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  icon?: unknown;
  color?: unknown;
  parentFolderId?: unknown;
  parentId?: unknown;
  clientId?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
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

type SimpleUserProfileDto = {
  name?: unknown;
  userPath?: unknown;
  photo?: unknown;
  biography?: unknown;
};

type NoteDto = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  tags?: unknown;
  lastChangedAt?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  publishedAt?: unknown;
  tagsUpdatedAt?: unknown;
  titleUpdatedAt?: unknown;
  lastChangeUser?: unknown;
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

type NoteImageUploadResponseDto = {
  data?: unknown;
};

type CacheKey =
  | 'currentUser'
  | 'teams'
  | 'notes'
  | 'history'
  | 'folders'
  | 'folderOrder'
  | `folder:${string}`
  | `team:${string}:notes`
  | `team:${string}:folders`
  | `team:${string}:folderOrder`
  | `team:${string}:folder:${string}`
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

function isFormDataBody(body: RequestInit['body']) {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

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

  if (value && typeof value === 'object' && 'folder' in value) {
    return value.folder;
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

export function mapFolder(dto: FolderDto): FolderSummary {
  return {
    id: asString(dto.id),
    name: asString(dto.name, 'Folder'),
    description: asNullableString(dto.description),
    icon: asNullableString(dto.icon),
    color: asNullableString(dto.color),
    parentId: asNullableString(dto.parentFolderId ?? dto.parentId),
    clientId: asNullableString(dto.clientId),
    createdAtMillis: toMillis(dto.createdAt),
    updatedAtMillis: toMillis(dto.updatedAt),
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

export function mapSimpleUserProfile(dto: SimpleUserProfileDto): SimpleUserProfile {
  const username = asString(dto.userPath);

  return {
    name: asString(dto.name, username || 'Unknown User'),
    username,
    photo: asNullableString(dto.photo),
    biography: asNullableString(dto.biography),
  };
}

export function mapNote(dto: NoteDto): NoteSummary {
  const id = asString(dto.id);
  const shortId = asString(dto.shortId, id);
  const lastChangeUser = dto.lastChangeUser && typeof dto.lastChangeUser === 'object'
    ? mapSimpleUserProfile(dto.lastChangeUser as SimpleUserProfileDto)
    : null;

  return {
    id,
    title: asString(dto.title, 'Untitled'),
    description: asString(dto.description),
    tags: getJsonArray(dto.tags).filter((tag): tag is string => typeof tag === 'string'),
    updatedAtMillis: toMillis(dto.lastChangedAt ?? dto.updatedAt),
    createdAtMillis: toMillis(dto.createdAt),
    publishedAtMillis: toMillis(dto.publishedAt),
    tagsUpdatedAtMillis: toMillis(dto.tagsUpdatedAt),
    titleUpdatedAtMillis: toMillis(dto.titleUpdatedAt),
    content: typeof dto.content === 'string' ? dto.content : null,
    publishLink: asString(dto.publishLink),
    shortId,
    permalink: asNullableString(dto.permalink),
    teamPath: asNullableString(dto.teamPath),
    userPath: asNullableString(dto.userPath),
    publishType: toPublishType(dto.publishType),
    readPermission: toPermission(dto.readPermission),
    writePermission: toPermission(dto.writePermission),
    lastChangeUser,
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
        ...(init.body && !isFormDataBody(init.body) ? { 'Content-Type': 'application/json' } : {}),
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

export function sortFolders(folders: FolderSummary[]) {
  return [...folders].sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));
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
    publishedAtMillis: null,
    tagsUpdatedAtMillis: null,
    titleUpdatedAtMillis: null,
    content: input.content ?? '',
    publishLink: '',
    shortId: '',
    permalink: null,
    teamPath: null,
    userPath: null,
    publishType: 'edit',
    readPermission: input.readPermission ?? 'owner',
    writePermission: input.writePermission ?? 'owner',
    lastChangeUser: null,
    folderPaths: [],
  };
}

function createEmptyFolder(input: CreateFolderInput | UpdateFolderInput, folderId = ''): FolderSummary {
  const now = Date.now();

  return {
    id: folderId,
    name: input.name?.trim() || 'Folder',
    description: input.description ?? null,
    icon: input.icon ?? null,
    color: input.color ?? null,
    parentId: input.parentFolderId ?? null,
    clientId: null,
    createdAtMillis: now,
    updatedAtMillis: now,
  };
}

function normalizeFolderOrder(value: unknown): FolderOrder {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([parentId, folderIds]) => [
      parentId,
      Array.isArray(folderIds) ? folderIds.filter((folderId): folderId is string => typeof folderId === 'string') : [],
    ]),
  );
}

function mapImageUploadResponse(response: NoteImageUploadResponseDto): UploadNoteImageResult {
  const data = response.data && typeof response.data === 'object' ? response.data as { link?: unknown } : {};
  const link = asString(data.link);

  if (!link) {
    throw new Error('HackMD did not return an uploaded image link.');
  }

  return { link };
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

  async function createOrUpdateFolder(
    path: string,
    method: 'POST' | 'PATCH',
    input: CreateFolderInput | UpdateFolderInput,
    folderId = '',
  ) {
    const response = await requestHackmd<FolderDto | undefined>(path, {
      method,
      body: JSON.stringify(input),
    }, serviceOptions);

    if (!response) {
      return createEmptyFolder(input, folderId);
    }

    return mapFolder(normalizeHackmdResponse(response) as FolderDto);
  }

  return {
    validateToken(token: string) {
      const normalizedToken = token.trim();

      if (!normalizedToken) {
        throw new Error('Enter a HackMD API token before testing it.');
      }

      return requestHackmd<UserDto>('/me', {}, {
        ...serviceOptions,
        readToken: async () => normalizedToken,
      }).then(mapUser);
    },

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

    listFolders() {
      return withCache(
        'folders',
        requestHackmd<FolderDto[]>('/folders', {}, serviceOptions)
          .then((folders) => sortFolders(folders.map(mapFolder))),
      );
    },

    listTeamFolders(teamPath: string) {
      const normalizedTeamPath = teamPath.trim();

      return withCache(
        `team:${normalizedTeamPath}:folders`,
        requestHackmd<FolderDto[]>(`/teams/${encodePathSegment(normalizedTeamPath)}/folders`, {}, serviceOptions)
          .then((folders) => sortFolders(folders.map(mapFolder))),
      );
    },

    getFolder(folderId: string) {
      const normalizedFolderId = folderId.trim();

      return withCache(
        `folder:${normalizedFolderId}`,
        requestHackmd<FolderDto>(`/folders/${encodePathSegment(normalizedFolderId)}`, {}, serviceOptions)
          .then((folder) => mapFolder(normalizeHackmdResponse(folder) as FolderDto)),
      );
    },

    getTeamFolder(teamPath: string, folderId: string) {
      const normalizedTeamPath = teamPath.trim();
      const normalizedFolderId = folderId.trim();

      return withCache(
        `team:${normalizedTeamPath}:folder:${normalizedFolderId}`,
        requestHackmd<FolderDto>(
          `/teams/${encodePathSegment(normalizedTeamPath)}/folders/${encodePathSegment(normalizedFolderId)}`,
          {},
          serviceOptions,
        ).then((folder) => mapFolder(normalizeHackmdResponse(folder) as FolderDto)),
      );
    },

    getFolderOrder() {
      return withCache(
        'folderOrder',
        requestHackmd<FolderOrder>('/folders/folder-order', {}, serviceOptions).then(normalizeFolderOrder),
      );
    },

    getTeamFolderOrder(teamPath: string) {
      const normalizedTeamPath = teamPath.trim();

      return withCache(
        `team:${normalizedTeamPath}:folderOrder`,
        requestHackmd<FolderOrder>(
          `/teams/${encodePathSegment(normalizedTeamPath)}/folders/folder-order`,
          {},
          serviceOptions,
        ).then(normalizeFolderOrder),
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
      memoryCache.delete('notes');
      return createOrUpdateDocument('/notes', 'POST', input);
    },

    createTeamNote(teamPath: string, input: CreateNoteInput) {
      memoryCache.delete(`team:${teamPath}:notes`);
      return createOrUpdateDocument(`/teams/${encodePathSegment(teamPath)}/notes`, 'POST', input);
    },

    createFolder(input: CreateFolderInput) {
      memoryCache.delete('folders');
      return createOrUpdateFolder('/folders', 'POST', input);
    },

    createTeamFolder(teamPath: string, input: CreateFolderInput) {
      memoryCache.delete(`team:${teamPath}:folders`);
      return createOrUpdateFolder(`/teams/${encodePathSegment(teamPath)}/folders`, 'POST', input);
    },

    updateFolder(folderId: string, input: UpdateFolderInput) {
      memoryCache.delete('folders');
      memoryCache.delete(`folder:${folderId}`);
      return createOrUpdateFolder(
        `/folders/${encodePathSegment(folderId)}`,
        'PATCH',
        input,
        folderId,
      );
    },

    updateTeamFolder(teamPath: string, folderId: string, input: UpdateFolderInput) {
      memoryCache.delete(`team:${teamPath}:folders`);
      memoryCache.delete(`team:${teamPath}:folder:${folderId}`);
      return createOrUpdateFolder(
        `/teams/${encodePathSegment(teamPath)}/folders/${encodePathSegment(folderId)}`,
        'PATCH',
        input,
        folderId,
      );
    },

    updateNote(noteId: string, input: UpdateNoteInput) {
      memoryCache.delete('notes');
      memoryCache.delete(`note:${noteId}`);
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
      memoryCache.delete(`team:${teamPath}:notes`);
      memoryCache.delete(`team:${teamPath}:note:${noteId}`);
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

    async deleteFolder(folderId: string) {
      await requestHackmd<void>(`/folders/${encodePathSegment(folderId)}`, { method: 'DELETE' }, serviceOptions);
      memoryCache.delete('folders');
      memoryCache.delete('notes');
      memoryCache.delete(`folder:${folderId}`);
    },

    async deleteTeamFolder(teamPath: string, folderId: string) {
      await requestHackmd<void>(
        `/teams/${encodePathSegment(teamPath)}/folders/${encodePathSegment(folderId)}`,
        { method: 'DELETE' },
        serviceOptions,
      );
      memoryCache.delete(`team:${teamPath}:folders`);
      memoryCache.delete(`team:${teamPath}:notes`);
      memoryCache.delete(`team:${teamPath}:folder:${folderId}`);
    },

    async updateFolderOrder(order: FolderOrder) {
      await requestHackmd<void>('/folders/folder-order', {
        method: 'PUT',
        body: JSON.stringify({ order }),
      }, serviceOptions);
      memoryCache.delete('folderOrder');
      memoryCache.delete('folders');
    },

    async updateTeamFolderOrder(teamPath: string, order: FolderOrder) {
      await requestHackmd<void>(`/teams/${encodePathSegment(teamPath)}/folders/folder-order`, {
        method: 'PUT',
        body: JSON.stringify({ order }),
      }, serviceOptions);
      memoryCache.delete(`team:${teamPath}:folderOrder`);
      memoryCache.delete(`team:${teamPath}:folders`);
    },

    async uploadNoteImage(noteId: string, input: UploadNoteImageInput) {
      const form = new FormData();
      const blob = new Blob([input.bytes], { type: input.mimeType || 'application/octet-stream' });

      form.append('image', blob, input.fileName || 'image');

      const response = await requestHackmd<NoteImageUploadResponseDto>(
        `/notes/${encodePathSegment(noteId)}/images`,
        {
          method: 'POST',
          body: form,
        },
        serviceOptions,
      );

      return mapImageUploadResponse(response);
    },
  };
}

const defaultHackmdService = createHackmdService();

export const validateToken = defaultHackmdService.validateToken;
export const getCurrentUser = defaultHackmdService.getCurrentUser;
export const listTeams = defaultHackmdService.listTeams;
export const listNotes = defaultHackmdService.listNotes;
export const listHistory = defaultHackmdService.listHistory;
export const listTeamNotes = defaultHackmdService.listTeamNotes;
export const listFolders = defaultHackmdService.listFolders;
export const listTeamFolders = defaultHackmdService.listTeamFolders;
export const getFolder = defaultHackmdService.getFolder;
export const getTeamFolder = defaultHackmdService.getTeamFolder;
export const getFolderOrder = defaultHackmdService.getFolderOrder;
export const getTeamFolderOrder = defaultHackmdService.getTeamFolderOrder;
export const getNote = defaultHackmdService.getNote;
export const createNote = defaultHackmdService.createNote;
export const createTeamNote = defaultHackmdService.createTeamNote;
export const createFolder = defaultHackmdService.createFolder;
export const createTeamFolder = defaultHackmdService.createTeamFolder;
export const updateFolder = defaultHackmdService.updateFolder;
export const updateTeamFolder = defaultHackmdService.updateTeamFolder;
export const updateNote = defaultHackmdService.updateNote;
export const updateTeamNote = defaultHackmdService.updateTeamNote;
export const deleteNote = defaultHackmdService.deleteNote;
export const deleteTeamNote = defaultHackmdService.deleteTeamNote;
export const deleteFolder = defaultHackmdService.deleteFolder;
export const deleteTeamFolder = defaultHackmdService.deleteTeamFolder;
export const updateFolderOrder = defaultHackmdService.updateFolderOrder;
export const updateTeamFolderOrder = defaultHackmdService.updateTeamFolderOrder;
export const uploadNoteImage = defaultHackmdService.uploadNoteImage;
