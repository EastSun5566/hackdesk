import type {
  CreateNoteInput,
  DocumentSummary,
  CreateFolderInput,
  FolderOrder,
  FolderPathSummary,
  FolderSummary,
  NotePermissionRole,
  CreateNoteVersionInput,
  CreateNoteVersionResult,
  NoteVersionDetail,
  NoteVersionPage,
  NoteVersionRef,
  NoteVersionSummary,
  RestoreTrashFailureReason,
  NoteComment,
  NoteCommentActor,
  NoteCommentAnchor,
  NoteCommentPage,
  NoteCommentResolutionResult,
  NoteCommentsQuery,
  RestoreTrashResult,
  TrashedNoteSummary,
  NoteVersionsQuery,
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
import {
  HACKMD_NOTE_COMMENTS_UNAVAILABLE_MESSAGE,
  HACKMD_NOTE_NOT_FOUND_MESSAGE,
  HACKMD_NOTE_VERSIONS_UNAVAILABLE_MESSAGE,
} from '../../../src/lib/note-errors';
import { setTimeout as wait } from 'node:timers/promises';

const HACKMD_API_BASE_URL = 'https://api.hackmd.io/v1';
const HACKMD_TIMEOUT_MS = 20_000;
const HACKMD_READ_BUDGET_MS = 30_000;
const HACKMD_UPLOAD_TIMEOUT_MS = 60_000;

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

type NoteVersionDto = {
  id?: unknown;
  name?: unknown;
  name_source?: unknown;
  description?: unknown;
  created_at?: unknown;
  created_by?: unknown;
  content_available?: unknown;
  content?: unknown;
};

type NoteVersionPageDto = {
  data?: unknown;
  meta?: { page?: unknown; total_pages?: unknown; total?: unknown };
};

type NoteImageUploadResponseDto = {
  data?: unknown;
};

type CacheKey =
  | 'currentUser'
  | 'teams'
  | 'notes'
  | `history:${number}`
  | 'folders'
  | 'folderOrder'
  | `folder:${string}`
  | `team:${string}:notes`
  | `team:${string}:folders`
  | `team:${string}:folderOrder`
  | `team:${string}:folder:${string}`
  | `note:${string}`
  | `team:${string}:note:${string}`;

/**
 * Fallback values for offline reads. Every invalidation starts a new
 * generation, and a response is cached only if no invalidation happened while
 * it was in flight, so a late response cannot restore stale data.
 */
function createFallbackCache() {
  const entries = new Map<CacheKey, unknown>();
  let generation = 0;

  return {
    load<T>(cacheKey: CacheKey, promise: Promise<T>): Promise<RepositoryValue<T>> {
      const startedGeneration = generation;
      return promise
        .then((data) => {
          if (startedGeneration === generation) entries.set(cacheKey, data);
          return { source: 'remote' as const, data };
        })
        .catch((error) => {
          if (error?.name === 'AbortError') throw error;
          const cached = entries.get(cacheKey) as T | undefined;
          const message = error instanceof Error ? error.message : 'Something went wrong while talking to HackMD.';

          if (cached !== undefined) {
            return { source: 'error' as const, error: message, data: cached };
          }

          return { source: 'error' as const, error: message };
        });
    },
    invalidate(matches: (key: CacheKey) => boolean) {
      generation += 1;
      for (const key of entries.keys()) {
        if (matches(key)) entries.delete(key);
      }
    },
    clear() {
      generation += 1;
      entries.clear();
    },
  };
}

type FallbackCache = ReturnType<typeof createFallbackCache>;

const compatibilityCache = createFallbackCache();

type HackmdFetch = typeof fetch;

type HackmdServiceOptions = {
  baseUrl?: string;
  timeoutMs?: number;
  fetcher?: HackmdFetch;
  readToken?: () => Promise<string>;
  readAttempts?: number;
  readBudgetMs?: number;
  uploadTimeoutMs?: number;
};

function retryAfterMs(value: string | null) {
  if (!value) return undefined;
  const delay = /^\d+$/.test(value.trim()) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined;
}

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

/** Like `toMillis`, but also reads ISO-8601 strings such as version `created_at`. */
export function parseTimestamp(value: unknown): number | null {
  const millis = toMillis(value);
  if (millis !== null || typeof value !== 'string') {
    return millis;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function mapDocument(dto: NoteDto, etag: string | null = null): DocumentSummary {
  const note = mapNote(dto);

  return {
    ...note,
    content: note.content ?? '',
    etag,
  };
}

export function mapNoteVersion(dto: NoteVersionDto): NoteVersionSummary {
  const author = dto.created_by && typeof dto.created_by === 'object'
    ? dto.created_by as { user_id?: unknown; display_name?: unknown; photo?: unknown }
    : null;

  return {
    id: asString(dto.id),
    name: asString(dto.name),
    nameSource: dto.name_source === 'user' ? 'user' : 'system',
    description: asNullableString(dto.description),
    createdAtMillis: parseTimestamp(dto.created_at),
    createdBy: author
      ? { userId: asString(author.user_id), displayName: asString(author.display_name, 'Unknown User'), photo: asNullableString(author.photo) }
      : null,
    contentAvailable: asBoolean(dto.content_available),
  };
}

type CommentDto = Record<string, unknown>;

const COMMENT_ACTOR_KINDS: ReadonlySet<NoteCommentActor['kind']> = new Set(['user', 'guest', 'team', 'deleted_user']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function toCommentStatus(value: unknown) {
  return value === 'open' || value === 'hidden' ? value : null;
}

function mapCommentAnchor(value: unknown): NoteCommentAnchor | null {
  const anchor = asRecord(value);
  const { offset, length } = anchor ?? {};
  return Number.isInteger(offset) && Number.isInteger(length) && (offset as number) >= 0 && (length as number) >= 0
    ? { offset: offset as number, length: length as number }
    : null;
}

function mapNoteComment(dto: CommentDto): NoteComment {
  const actor = asRecord(dto.actor);
  const kind = COMMENT_ACTOR_KINDS.has(actor?.kind as NoteCommentActor['kind']) ? actor!.kind as NoteCommentActor['kind'] : 'user';
  const state = asRecord(dto.commentState);
  const threadState = asRecord(dto.threadState);

  return {
    id: asString(dto.id),
    threadId: asString(dto.threadId),
    actor: { kind, displayName: asNullableString(actor?.displayName) },
    body: typeof dto.body === 'string' ? dto.body : '',
    status: toCommentStatus(state?.status) ?? 'open',
    statusReason: asNullableString(state?.reason),
    isThreadHead: asBoolean(dto.isThreadHead),
    threadStatus: toCommentStatus(threadState?.status),
    threadStatusReason: asNullableString(threadState?.reason),
    anchor: mapCommentAnchor(dto.anchor),
    currentAnchor: mapCommentAnchor(dto.currentAnchor),
    excerpt: typeof dto.excerpt === 'string' && dto.excerpt ? dto.excerpt : null,
    createdAtMillis: parseTimestamp(dto.createdAt),
    updatedAtMillis: parseTimestamp(dto.updatedAt),
  };
}

type TrashNoteDto = {
  id?: unknown;
  title?: unknown;
  tags?: unknown;
  deletedAt?: unknown;
  permanentDeletedAt?: unknown;
};

function mapTrashedNote(dto: TrashNoteDto): TrashedNoteSummary {
  return {
    id: asString(dto.id),
    title: asString(dto.title),
    tags: getJsonArray(dto.tags).filter((tag): tag is string => typeof tag === 'string'),
    deletedAtMillis: parseTimestamp(dto.deletedAt),
    permanentDeleteAtMillis: parseTimestamp(dto.permanentDeletedAt),
  };
}

const RESTORE_FAILURE_REASONS: ReadonlySet<RestoreTrashFailureReason> = new Set(['NOT_FOUND', 'PERMISSION_DENIED', 'INTERNAL_ERROR']);

/** Reads one outcome per requested id. An id HackMD leaves out counts as a failure. */
function mapRestoreTrashResult(noteIds: string[], body: unknown): RestoreTrashResult {
  const outcomes = body && typeof body === 'object' ? body as Record<string, unknown> : {};

  return Object.fromEntries(noteIds.map((noteId) => {
    const outcome = Object.hasOwn(outcomes, noteId) ? outcomes[noteId] as { status?: unknown; reason?: unknown } | null : null;
    if (outcome?.status === 'success') return [noteId, { status: 'success' }];
    const reason = RESTORE_FAILURE_REASONS.has(outcome?.reason as RestoreTrashFailureReason)
      ? outcome!.reason as RestoreTrashFailureReason
      : 'UNKNOWN';
    return [noteId, { status: 'failure', reason }];
  }));
}

function toPositiveInteger(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

const COMMENT_PAGE_SIZE = 100;
const MAX_ERROR_DETAIL_LENGTH = 300;
const EMPTY_NOTE_MESSAGE = 'HackMD returned an empty note.';

/**
 * Reads the reason from a HackMD error body. The API answers with
 * `{ error: string }`, `{ message }`, `{ error_code, message }`, a quota
 * error `{ error: { code, message } }` or a validation error with per-field
 * `details`.
 */
export function getHackmdErrorDetail(body: unknown): { message: string | null; code: string | null } {
  if (!body || typeof body !== 'object') {
    return { message: null, code: null };
  }

  const { error, message, details, error_code: errorCode } = body as Record<string, unknown>;
  if (error && typeof error === 'object') {
    const quota = error as Record<string, unknown>;
    return { message: asNullableString(quota.message), code: asNullableString(quota.code) };
  }

  const fields = details && typeof details === 'object'
    ? Object.entries(details).flatMap(([field, detail]) => {
      const fieldMessage = detail && typeof detail === 'object' ? asNullableString((detail as { message?: unknown }).message) : null;
      return fieldMessage ? [`${field}: ${fieldMessage}`] : [];
    })
    : [];

  return {
    message: fields.length > 0 ? fields.join('; ') : asNullableString(error) ?? asNullableString(message),
    code: asNullableString(errorCode),
  };
}

export function getHackmdErrorMessage(status: number, statusText: string, body?: unknown) {
  if (status === 401) {
    return 'Your HackMD API token is invalid or expired.';
  }

  if (status === 403) {
    return 'Your HackMD API token does not have permission for this action.';
  }

  if (status >= 500) {
    return 'HackMD is having trouble right now. Please try again in a moment.';
  }

  const detail = getHackmdErrorDetail(body);
  const reason = detail.message && detail.message.length > MAX_ERROR_DETAIL_LENGTH
    ? `${detail.message.slice(0, MAX_ERROR_DETAIL_LENGTH)}…`
    : detail.message;

  if (status === 429) {
    if (detail.code === 'quota_exceeded') {
      return `Your HackMD workspace has reached its quota.${reason ? ` ${reason}` : ''}`;
    }

    return 'HackMD is rate limiting requests right now. Please try again in a moment.';
  }

  if (reason) {
    return `HackMD rejected the request: ${reason}`;
  }

  if (status === 413) {
    return 'The file is too large for HackMD.';
  }

  if (status === 415) {
    return 'HackMD does not accept this file type.';
  }

  return `HackMD returned ${status} ${statusText}.`;
}

async function readErrorBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

type HackmdResponse<T> = {
  status: number;
  etag: string | null;
  data: T;
};

/** Sends a request and keeps the status and ETag. A 304 resolves with no data. */
async function sendHackmdAttempt<T>(
  path: string,
  init: RequestInit,
  options: Required<HackmdServiceOptions>,
): Promise<HackmdResponse<T | undefined>> {
  const token = await options.readToken();
  init.signal?.throwIfAborted();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const response = await options.fetcher(`${options.baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.any([controller.signal, ...(init.signal ? [init.signal] : [])]),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body && !isFormDataBody(init.body) ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });

    const etag = response.headers.get('ETag');
    if (response.status === 304) {
      return { status: response.status, etag, data: undefined };
    }

    if (!response.ok) {
      const body = await readErrorBody(response);
      throw Object.assign(new Error(getHackmdErrorMessage(response.status, response.statusText, body)), {
        status: response.status,
        body,
        retryable: [408, 429, 500, 502, 503, 504].includes(response.status),
        retryAfterMs: retryAfterMs(response.headers.get('Retry-After')),
      });
    }

    const text = response.status === 204 ? '' : await response.text();
    return { status: response.status, etag, data: text ? JSON.parse(text) as T : undefined };
  } catch (error) {
    init.signal?.throwIfAborted();
    if (controller.signal.aborted) {
      throw Object.assign(new Error('HackMD took too long to respond. Please try again.'), { retryable: true, timeout: true });
    }
    if (error instanceof TypeError) {
      throw Object.assign(new Error('Unable to reach HackMD. Check your connection and try again.'), { retryable: true });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** Only GETs may retry. The deadline includes attempts, response bodies and backoff. */
async function sendHackmd<T>(path: string, init: RequestInit, options: Required<HackmdServiceOptions>): Promise<HackmdResponse<T | undefined>> {
  if (init.method && init.method.toUpperCase() !== 'GET') return sendHackmdAttempt<T>(path, init, options);
  const budget = new AbortController();
  const deadline = Date.now() + options.readBudgetMs;
  const timer = setTimeout(() => budget.abort(new Error('HackMD took too long to respond. Please try again.')), options.readBudgetMs);
  const signal = AbortSignal.any([budget.signal, ...(init.signal ? [init.signal] : [])]);
  try {
    for (let attempt = 1; ; attempt += 1) {
      signal.throwIfAborted();
      try {
        return await sendHackmdAttempt<T>(path, { ...init, signal }, options);
      } catch (error) {
        signal.throwIfAborted();
        const failure = error as { retryable?: boolean; retryAfterMs?: number };
        if (!failure.retryable || attempt >= options.readAttempts) throw error;
        const delay = failure.retryAfterMs ?? 250 * 4 ** (attempt - 1);
        // Never retry earlier than the server requested just to fit our budget.
        if (Date.now() + delay >= deadline) throw error;
        await wait(delay, undefined, { signal }).catch(error => {
          signal.throwIfAborted();
          throw error;
        });
      }
    }
  } finally {
    clearTimeout(timer);
  }
}

async function requestHackmd<T>(
  path: string,
  init: RequestInit = {},
  options: Required<HackmdServiceOptions>,
): Promise<T> {
  return (await sendHackmd<T>(path, init, options)).data as T;
}

function rethrowVersionsUnavailable(error: unknown): never {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 403 || status === 404) throw new Error(HACKMD_NOTE_VERSIONS_UNAVAILABLE_MESSAGE);
  throw error;
}

function rethrowCommentsUnavailable(error: unknown): never {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 403 || status === 404) throw new Error(HACKMD_NOTE_COMMENTS_UNAVAILABLE_MESSAGE);
  throw error;
}

function rethrowNoteNotFound(error: unknown): never {
  // A 404 confirms the note is gone for this account, unlike a timeout or server error.
  if ((error as { status?: unknown } | null)?.status === 404) throw new Error(HACKMD_NOTE_NOT_FOUND_MESSAGE);
  throw error;
}

export function withCache<T>(cacheKey: CacheKey, promise: Promise<T>): Promise<RepositoryValue<T>> {
  return compatibilityCache.load(cacheKey, promise);
}

/** Keys a note write can make stale: its list, its document and every history page. */
function isNoteDependentKey(key: CacheKey, teamPath: string | null, noteId?: string) {
  return key === (teamPath ? `team:${teamPath}:notes` : 'notes')
    || key.startsWith('history:')
    || (noteId !== undefined && key === (teamPath ? `team:${teamPath}:note:${noteId}` : `note:${noteId}`));
}

/**
 * Invalidates before and after a write. The second pass drops responses for
 * reads that started while the write was in flight and may predate it.
 */
async function invalidatingWrite<T>(cache: FallbackCache, matches: (key: CacheKey) => boolean, write: () => Promise<T>) {
  cache.invalidate(matches);
  try {
    return await write();
  } finally {
    cache.invalidate(matches);
  }
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
  const cache = createFallbackCache();
  const withCache = <T>(cacheKey: CacheKey, promise: Promise<T>) => cache.load(cacheKey, promise);
  const writing = <T>(matches: (key: CacheKey) => boolean, write: () => Promise<T>) => invalidatingWrite(cache, matches, write);
  const keyIn = (...keys: CacheKey[]) => (key: CacheKey) => keys.includes(key);
  const serviceOptions: Required<HackmdServiceOptions> = {
    baseUrl: options.baseUrl ?? HACKMD_API_BASE_URL,
    timeoutMs: options.timeoutMs ?? HACKMD_TIMEOUT_MS,
    fetcher: options.fetcher ?? fetch,
    readToken: options.readToken ?? defaultReadHackmdApiToken,
    readAttempts: options.readAttempts ?? 3,
    readBudgetMs: options.readBudgetMs ?? HACKMD_READ_BUDGET_MS,
    uploadTimeoutMs: options.uploadTimeoutMs ?? HACKMD_UPLOAD_TIMEOUT_MS,
  };

  function getNotePath(noteId: string, teamPath?: string | null) {
    const normalizedTeamPath = teamPath?.trim();
    return normalizedTeamPath
      ? `/teams/${encodePathSegment(normalizedTeamPath)}/notes/${encodePathSegment(noteId)}`
      : `/notes/${encodePathSegment(noteId)}`;
  }

  /** Resolves null only for a 304. Any other response without a note fails, so the pre-save check fails closed. */
  async function readDocument(path: string, init: RequestInit = {}) {
    const response = await sendHackmd<NoteDto>(path, init, serviceOptions);
    if (response.status === 304) {
      return null;
    }

    if (!response.data) {
      throw new Error(EMPTY_NOTE_MESSAGE);
    }

    return mapDocument(normalizeHackmdResponse(response.data) as NoteDto, response.etag);
  }

  async function fetchDocument(path: string, signal?: AbortSignal) {
    const document = await readDocument(path, { signal });
    if (!document) {
      throw new Error(EMPTY_NOTE_MESSAGE);
    }

    return document;
  }

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
    clearCache() {
      cache.clear();
    },
    validateToken(token: string, signal?: AbortSignal) {
      const normalizedToken = token.trim();

      if (!normalizedToken) {
        throw new Error('Enter a HackMD API token before testing it.');
      }

      return requestHackmd<UserDto>('/me', { signal }, {
        ...serviceOptions,
        readToken: async () => normalizedToken,
      }).then(mapUser);
    },

    getCurrentUser(signal?: AbortSignal) {
      return withCache(
        'currentUser',
        requestHackmd<UserDto>('/me', { signal }, serviceOptions).then(mapUser),
      );
    },

    listTeams(signal?: AbortSignal) {
      return withCache(
        'teams',
        requestHackmd<TeamDto[]>('/teams', { signal }, serviceOptions).then((teams) => teams.map(mapTeam)),
      );
    },

    listNotes(signal?: AbortSignal) {
      return withCache(
        'notes',
        requestHackmd<NoteDto[]>('/notes', { signal }, serviceOptions).then((notes) => sortNotes(notes.map(mapNote))),
      );
    },

    listHistory(limit = 20, signal?: AbortSignal) {
      const query = new URLSearchParams({ limit: String(limit) });
      return withCache(
        `history:${limit}`,
        requestHackmd<NoteDto[]>(`/history?${query.toString()}`, { signal }, serviceOptions)
          .then((notes) => sortNotes(notes.map(mapNote))),
      );
    },

    listFolders(signal?: AbortSignal) {
      return withCache(
        'folders',
        requestHackmd<FolderDto[]>('/folders', { signal }, serviceOptions)
          .then((folders) => sortFolders(folders.map(mapFolder))),
      );
    },

    listTeamFolders(teamPath: string, signal?: AbortSignal) {
      const normalizedTeamPath = teamPath.trim();

      return withCache(
        `team:${normalizedTeamPath}:folders`,
        requestHackmd<FolderDto[]>(`/teams/${encodePathSegment(normalizedTeamPath)}/folders`, { signal }, serviceOptions)
          .then((folders) => sortFolders(folders.map(mapFolder))),
      );
    },

    getFolder(folderId: string, signal?: AbortSignal) {
      const normalizedFolderId = folderId.trim();

      return withCache(
        `folder:${normalizedFolderId}`,
        requestHackmd<FolderDto>(`/folders/${encodePathSegment(normalizedFolderId)}`, { signal }, serviceOptions)
          .then((folder) => mapFolder(normalizeHackmdResponse(folder) as FolderDto)),
      );
    },

    getTeamFolder(teamPath: string, folderId: string, signal?: AbortSignal) {
      const normalizedTeamPath = teamPath.trim();
      const normalizedFolderId = folderId.trim();

      return withCache(
        `team:${normalizedTeamPath}:folder:${normalizedFolderId}`,
        requestHackmd<FolderDto>(
          `/teams/${encodePathSegment(normalizedTeamPath)}/folders/${encodePathSegment(normalizedFolderId)}`,
          { signal },
          serviceOptions,
        ).then((folder) => mapFolder(normalizeHackmdResponse(folder) as FolderDto)),
      );
    },

    getFolderOrder(signal?: AbortSignal) {
      return withCache(
        'folderOrder',
        requestHackmd<FolderOrder>('/folders/folder-order', { signal }, serviceOptions).then(normalizeFolderOrder),
      );
    },

    getTeamFolderOrder(teamPath: string, signal?: AbortSignal) {
      const normalizedTeamPath = teamPath.trim();

      return withCache(
        `team:${normalizedTeamPath}:folderOrder`,
        requestHackmd<FolderOrder>(
          `/teams/${encodePathSegment(normalizedTeamPath)}/folders/folder-order`,
          { signal },
          serviceOptions,
        ).then(normalizeFolderOrder),
      );
    },

    listTeamNotes(teamPath: string, signal?: AbortSignal) {
      const normalizedTeamPath = teamPath.trim();
      return withCache(
        `team:${normalizedTeamPath}:notes`,
        requestHackmd<NoteDto[]>(`/teams/${encodePathSegment(normalizedTeamPath)}/notes`, { signal }, serviceOptions)
          .then((notes) => sortNotes(notes.map(mapNote))),
      );
    },

    getNote(noteId: string, teamPath?: string | null, signal?: AbortSignal) {
      const normalizedTeamPath = teamPath?.trim();
      const cacheKey: CacheKey = normalizedTeamPath
        ? `team:${normalizedTeamPath}:note:${noteId}`
        : `note:${noteId}`;

      return withCache(cacheKey, fetchDocument(getNotePath(noteId, teamPath), signal).catch(rethrowNoteNotFound));
    },

    /** Reads the note only if it changed since `etag`; resolves null when HackMD answers 304. */
    getNoteIfChanged(noteId: string, teamPath: string | null, etag: string, signal?: AbortSignal) {
      return readDocument(getNotePath(noteId, teamPath), { signal, headers: { 'If-None-Match': etag } }).catch(rethrowNoteNotFound);
    },

    createNote(input: CreateNoteInput) {
      return writing(
        (key) => isNoteDependentKey(key, null),
        () => createOrUpdateDocument('/notes', 'POST', input),
      );
    },

    createTeamNote(teamPath: string, input: CreateNoteInput) {
      return writing(
        (key) => isNoteDependentKey(key, teamPath),
        () => createOrUpdateDocument(`/teams/${encodePathSegment(teamPath)}/notes`, 'POST', input),
      );
    },

    createFolder(input: CreateFolderInput) {
      return writing(keyIn('folders'), () => createOrUpdateFolder('/folders', 'POST', input));
    },

    createTeamFolder(teamPath: string, input: CreateFolderInput) {
      return writing(
        keyIn(`team:${teamPath}:folders`),
        () => createOrUpdateFolder(`/teams/${encodePathSegment(teamPath)}/folders`, 'POST', input),
      );
    },

    updateFolder(folderId: string, input: UpdateFolderInput) {
      return writing(keyIn('folders', `folder:${folderId}`), () => createOrUpdateFolder(
        `/folders/${encodePathSegment(folderId)}`,
        'PATCH',
        input,
        folderId,
      ));
    },

    updateTeamFolder(teamPath: string, folderId: string, input: UpdateFolderInput) {
      return writing(keyIn(`team:${teamPath}:folders`, `team:${teamPath}:folder:${folderId}`), () => createOrUpdateFolder(
        `/teams/${encodePathSegment(teamPath)}/folders/${encodePathSegment(folderId)}`,
        'PATCH',
        input,
        folderId,
      ));
    },

    updateNote(noteId: string, input: UpdateNoteInput) {
      const path = getNotePath(noteId);
      return writing(
        (key) => isNoteDependentKey(key, null, noteId),
        () => createOrUpdateDocument(path, 'PATCH', input, () => fetchDocument(path)),
      );
    },

    updateTeamNote(teamPath: string, noteId: string, input: UpdateNoteInput) {
      const path = getNotePath(noteId, teamPath);
      return writing(
        (key) => isNoteDependentKey(key, teamPath, noteId),
        () => createOrUpdateDocument(path, 'PATCH', input, () => fetchDocument(path)),
      );
    },

    deleteNote(noteId: string) {
      return writing(
        (key) => isNoteDependentKey(key, null, noteId),
        () => requestHackmd<void>(`/notes/${encodePathSegment(noteId)}`, { method: 'DELETE' }, serviceOptions),
      );
    },

    /** Restores a personal note from the HackMD trash. */
    restoreNote(noteId: string) {
      return writing(
        (key) => isNoteDependentKey(key, null, noteId),
        () => requestHackmd<void>(`/trash/${encodePathSegment(noteId)}/restore`, { method: 'PUT' }, serviceOptions),
      );
    },

    /** Lists the personal trash. Not cached: the trash only makes sense online. */
    async listTrash(signal?: AbortSignal): Promise<TrashedNoteSummary[]> {
      const notes = await requestHackmd<TrashNoteDto[]>('/trash', { signal }, serviceOptions);
      return getJsonArray(notes)
        .map((note) => mapTrashedNote(note as TrashNoteDto))
        .sort((left, right) => (right.deletedAtMillis ?? 0) - (left.deletedAtMillis ?? 0));
    },

    /** Restores personal notes in one request. HackMD answers 207 when only some succeed. */
    async restoreNotes(noteIds: string[]): Promise<RestoreTrashResult> {
      return writing(
        (key) => isNoteDependentKey(key, null) || noteIds.some((noteId) => key === `note:${noteId}`),
        async () => mapRestoreTrashResult(noteIds, await requestHackmd<unknown>('/trash/batch-restore', {
          method: 'PUT',
          body: JSON.stringify({ noteIds }),
        }, serviceOptions)),
      );
    },

    deleteTeamNote(teamPath: string, noteId: string) {
      return writing(
        (key) => isNoteDependentKey(key, teamPath, noteId),
        () => requestHackmd<void>(`/teams/${encodePathSegment(teamPath)}/notes/${encodePathSegment(noteId)}`, {
          method: 'DELETE',
        }, serviceOptions),
      );
    },

    deleteFolder(folderId: string) {
      return writing(
        keyIn('folders', 'notes', `folder:${folderId}`),
        () => requestHackmd<void>(`/folders/${encodePathSegment(folderId)}`, { method: 'DELETE' }, serviceOptions),
      );
    },

    deleteTeamFolder(teamPath: string, folderId: string) {
      return writing(
        keyIn(`team:${teamPath}:folders`, `team:${teamPath}:notes`, `team:${teamPath}:folder:${folderId}`),
        () => requestHackmd<void>(
          `/teams/${encodePathSegment(teamPath)}/folders/${encodePathSegment(folderId)}`,
          { method: 'DELETE' },
          serviceOptions,
        ),
      );
    },

    updateFolderOrder(order: FolderOrder) {
      return writing(keyIn('folderOrder', 'folders'), () => requestHackmd<void>('/folders/folder-order', {
        method: 'PUT',
        body: JSON.stringify({ order }),
      }, serviceOptions));
    },

    updateTeamFolderOrder(teamPath: string, order: FolderOrder) {
      return writing(
        keyIn(`team:${teamPath}:folderOrder`, `team:${teamPath}:folders`),
        () => requestHackmd<void>(`/teams/${encodePathSegment(teamPath)}/folders/folder-order`, {
          method: 'PUT',
          body: JSON.stringify({ order }),
        }, serviceOptions),
      );
    },

    /** Names the note's current content as a version. A write, so it is sent once. */
    async createNoteVersion(noteId: string, input: CreateNoteVersionInput): Promise<CreateNoteVersionResult> {
      try {
        const response = await requestHackmd<NoteVersionDto>(`/notes/${encodePathSegment(noteId)}/versions`, {
          method: 'POST',
          body: JSON.stringify({
            base: 'note_content',
            name: input.name,
            ...(input.description ? { description: input.description } : {}),
          }),
        }, serviceOptions);
        return { status: 'created', version: mapNoteVersion(response ?? {}) };
      } catch (error) {
        const { status, body } = (error ?? {}) as { status?: unknown; body?: unknown };
        const conflict = status === 409 && body && typeof body === 'object' ? body as Record<string, unknown> : null;
        if (conflict?.error_code === 'no_content_change') {
          return { status: 'no_content_change', latestVersionId: asNullableString(conflict.latest_version_id) };
        }
        if (conflict?.error_code === 'version_already_named') {
          return { status: 'version_already_named', latestVersionId: asNullableString(conflict.version_id) };
        }
        return rethrowVersionsUnavailable(error);
      }
    },

    async listNoteVersions(noteId: string, query: NoteVersionsQuery, signal?: AbortSignal): Promise<NoteVersionPage> {
      const params = new URLSearchParams();
      if (query.namedOnly) params.set('named_only', 'true');
      if (query.page) params.set('page', String(query.page));
      if (query.limit) params.set('limit', String(query.limit));
      const search = params.size > 0 ? `?${params.toString()}` : '';
      const response = await requestHackmd<NoteVersionPageDto>(
        `/notes/${encodePathSegment(noteId)}/versions${search}`,
        { signal },
        serviceOptions,
      ).catch(rethrowVersionsUnavailable);
      const page = toPositiveInteger(response?.meta?.page, query.page ?? 1);

      return {
        versions: getJsonArray(response?.data).map((version) => mapNoteVersion(version as NoteVersionDto)),
        page,
        totalPages: toPositiveInteger(response?.meta?.total_pages, page),
        total: typeof response?.meta?.total === 'number' ? response.meta.total : 0,
      };
    },

    async getNoteVersion(noteId: string, versionId: string, signal?: AbortSignal): Promise<NoteVersionDetail> {
      const response = await requestHackmd<NoteVersionDto>(
        `/notes/${encodePathSegment(noteId)}/versions/${encodePathSegment(versionId)}`,
        { signal },
        serviceOptions,
      ).catch(rethrowVersionsUnavailable);
      const version = mapNoteVersion(response ?? {});

      return {
        ...version,
        content: version.contentAvailable && typeof response?.content === 'string' ? response.content : null,
      };
    },

    async compareNoteVersions(noteId: string, base: NoteVersionRef, target: NoteVersionRef, signal?: AbortSignal) {
      const params = new URLSearchParams({ base, target });
      const response = await requestHackmd<{ unified_diff?: unknown }>(
        `/notes/${encodePathSegment(noteId)}/versions/compare?${params.toString()}`,
        { signal },
        serviceOptions,
      ).catch(rethrowVersionsUnavailable);

      return { unifiedDiff: typeof response?.unified_diff === 'string' ? response.unified_diff : '' };
    },

    /** Lists comments and replies, oldest first. Not cached: comments are only useful online. */
    async listNoteComments(noteId: string, query: NoteCommentsQuery, signal?: AbortSignal): Promise<NoteCommentPage> {
      const page = query.page ?? 1;
      const params = new URLSearchParams({ page: String(page), limit: String(COMMENT_PAGE_SIZE), sort: 'asc' });
      const response = await requestHackmd<{ comments?: unknown; pagination?: { page?: unknown; hasNext?: unknown } }>(
        `/notes/${encodePathSegment(noteId)}/comments?${params.toString()}`,
        { signal },
        serviceOptions,
      ).catch(rethrowCommentsUnavailable);

      return {
        comments: getJsonArray(response?.comments).map((comment) => mapNoteComment(asRecord(comment) ?? {})),
        page: toPositiveInteger(response?.pagination?.page, page),
        hasNext: asBoolean(response?.pagination?.hasNext),
      };
    },

    /** Resolves or reopens a comment thread. A write, so it is sent once. */
    async setNoteCommentResolved(noteId: string, commentId: string, resolved: boolean): Promise<NoteCommentResolutionResult> {
      try {
        await requestHackmd<unknown>(
          `/notes/${encodePathSegment(noteId)}/comments/${encodePathSegment(commentId)}/resolution`,
          { method: resolved ? 'PUT' : 'DELETE' },
          serviceOptions,
        );
        return { status: 'updated' };
      } catch (error) {
        const status = (error as { status?: unknown } | null)?.status;
        if (status === 409) return { status: 'conflict' };
        if (status === 403) throw new Error("You can't resolve comments on this note.");
        throw error;
      }
    },

    async uploadNoteImage(noteId: string, input: UploadNoteImageInput, signal?: AbortSignal) {
      const form = new FormData();
      const blob = new Blob([input.bytes], { type: input.mimeType || 'application/octet-stream' });

      form.append('image', blob, input.fileName || 'image');

      const response = await requestHackmd<NoteImageUploadResponseDto>(
        `/notes/${encodePathSegment(noteId)}/images`,
        {
          method: 'POST',
          body: form,
          signal,
        },
        { ...serviceOptions, timeoutMs: serviceOptions.uploadTimeoutMs },
      ).catch((error: unknown) => {
        if ((error as { timeout?: boolean } | null)?.timeout) {
          throw new Error('Image upload timed out. It may have reached HackMD. Check the note before trying again.');
        }
        throw error;
      });

      return mapImageUploadResponse(response);
    },
  };
}

const defaultHackmdService = createHackmdService();

export const clearHackmdCache = defaultHackmdService.clearCache;
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
export const getNoteIfChanged = defaultHackmdService.getNoteIfChanged;
export const restoreNote = defaultHackmdService.restoreNote;
export const listTrash = defaultHackmdService.listTrash;
export const restoreNotes = defaultHackmdService.restoreNotes;
export const listNoteComments = defaultHackmdService.listNoteComments;
export const setNoteCommentResolved = defaultHackmdService.setNoteCommentResolved;
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
export const listNoteVersions = defaultHackmdService.listNoteVersions;
export const getNoteVersion = defaultHackmdService.getNoteVersion;
export const compareNoteVersions = defaultHackmdService.compareNoteVersions;
export const createNoteVersion = defaultHackmdService.createNoteVersion;
