import { afterEach, describe, expect, it, vi } from 'vitest';
import { HACKMD_NOTE_NOT_FOUND_MESSAGE, HACKMD_NOTE_VERSIONS_UNAVAILABLE_MESSAGE } from '../../../src/lib/note-errors';

import {
  createHackmdService,
  getHackmdErrorMessage,
  mapFolder,
  mapNote,
  mapTeam,
  mapUser,
  normalizeHackmdResponse,
  parseTimestamp,
  toMillis,
  withCache,
} from './hackmd-service';

type FetchCall = {
  url: string;
  init: RequestInit;
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function textResponse(body: string, init: ResponseInit = {}) {
  return new Response(init.status === 204 ? null : body, init);
}

function createFetchMock(responses: Response[]) {
  const calls: FetchCall[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const response = responses.shift();

    if (!response) {
      throw new Error('Unexpected fetch call.');
    }

    return response;
  }) as unknown as typeof fetch;

  return { calls, fetcher };
}

function createService(responses: Response[]) {
  const mock = createFetchMock(responses);
  const service = createHackmdService({
    baseUrl: 'https://api.test/v1',
    timeoutMs: 1000,
    fetcher: mock.fetcher,
    readToken: async () => 'test-token',
  });

  return { ...mock, service };
}

describe('bounded HackMD requests', () => {
  afterEach(() => vi.useRealTimers());
  const image = { fileName: 'image.png', mimeType: 'image/png', bytes: new ArrayBuffer(4) };
  const user = () => jsonResponse({ id: 'user', name: 'Fixture', teams: [] });
  const serviceFor = (fetcher: typeof fetch, options: Parameters<typeof createHackmdService>[0] = {}) => createHackmdService({
    fetcher, readToken: async () => 'fixture-token', ...options,
  });

  it.each(['seconds', 'HTTP-date'])('honors Retry-After as %s before retrying a rate-limited GET', async format => {
    const hint = format === 'seconds' ? '1' : new Date(Date.now() + 2000).toUTCString();
    const earliest = format === 'seconds' ? Date.now() + 1000 : Date.parse(hint);
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('busy', { status: 429, headers: { 'Retry-After': hint } }))
      .mockImplementationOnce(async () => {
        expect(Date.now()).toBeGreaterThanOrEqual(earliest);
        return user();
      });
    await expect(serviceFor(fetcher).getCurrentUser()).resolves.toMatchObject({ source: 'remote', data: { id: 'user' } });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not shorten Retry-After to retry ahead of a server hint outside the budget', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('busy', { status: 429, headers: { 'Retry-After': '60' } }));
    await expect(serviceFor(fetcher).listNotes()).resolves.toMatchObject({ source: 'error', error: expect.stringContaining('rate limiting') });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('backs off and stops after three server failures, retaining cached data', async () => {
    const calls: number[] = [];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(user()).mockImplementation(async () => {
      calls.push(Date.now());
      return new Response('busy', { status: 503 });
    });
    const service = serviceFor(fetcher);
    await service.getCurrentUser();
    expect(await service.getCurrentUser()).toMatchObject({ source: 'error', data: { id: 'user' }, error: expect.stringContaining('having trouble') });
    expect(calls).toHaveLength(3);
    expect(calls[1] - calls[0]).toBeGreaterThanOrEqual(200);
    expect(calls[2] - calls[1]).toBeGreaterThanOrEqual(900);
  });

  it('retries a transient network failure', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(user());
    await expect(serviceFor(fetcher).getCurrentUser()).resolves.toMatchObject({ source: 'remote' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 404])('does not retry a permanent %i read failure', async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status }));
    expect(await serviceFor(fetcher).getNote('note')).toMatchObject({ source: 'error' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('cancels a backoff immediately without returning offline cached data', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(user()).mockResolvedValueOnce(
      new Response('busy', { status: 429, headers: { 'Retry-After': '10' } }),
    );
    const service = serviceFor(fetcher);
    await service.getCurrentUser();
    const controller = new AbortController();
    const pending = expect(service.getCurrentUser(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    controller.abort();
    await pending;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('bounds the whole read, including a stalled fetch', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
    }));
    const pending = serviceFor(fetcher, { timeoutMs: 1000, readBudgetMs: 50 }).getCurrentUser();
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toMatchObject({ source: 'error', error: expect.stringContaining('too long') });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lets an upload outlive the ordinary request timeout and sends its bytes only once', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(async () => new Promise(resolve => {
      setTimeout(() => resolve(jsonResponse({ data: { link: 'https://assets.test/image.png' } })), 50);
    }));
    const pending = serviceFor(fetcher, { timeoutMs: 10, uploadTimeoutMs: 100 }).uploadNoteImage('note', image);
    await vi.advanceTimersByTimeAsync(20);
    expect(fetcher.mock.calls[0][1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(30);
    await expect(pending).resolves.toEqual({ link: 'https://assets.test/image.png' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('does not resend a timed-out upload and reports its uncertain server outcome', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
    }));
    const pending = expect(serviceFor(fetcher, { uploadTimeoutMs: 50 }).uploadNoteImage('note', image)).rejects.toThrow('It may have reached HackMD');
    await vi.advanceTimersByTimeAsync(50);
    await pending;
    expect(fetcher).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels an in-flight upload without retrying it', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
    }));
    const pending = expect(serviceFor(fetcher).uploadNoteImage('note', image, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    controller.abort();
    await pending;
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('never retries POST, PATCH, PUT or DELETE failures', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response('busy', { status: 503 }));
    const service = serviceFor(fetcher);
    for (const write of [() => service.createNote({}), () => service.updateNote('note', {}), () => service.updateFolderOrder({}), () => service.deleteNote('note')]) {
      await expect(write()).rejects.toThrow('having trouble');
    }
    expect(fetcher.mock.calls.map(([, init]) => init!.method)).toEqual(['POST', 'PATCH', 'PUT', 'DELETE']);
  });
});

describe('hackmd-service DTO mapping', () => {
  it('maps swagger NoteType fields to NoteSummary', () => {
    const note = mapNote({
      id: 'note-id',
      title: 'Roadmap',
      description: 'Q2 plan',
      tags: ['planning', 'team', 42],
      lastChangedAt: 1_700_000_000,
      createdAt: 1_700_000_000_500,
      publishedAt: 1_700_000_010,
      tagsUpdatedAt: 1_700_000_020,
      titleUpdatedAt: 1_700_000_030,
      lastChangeUser: {
        name: 'Reviewer',
        userPath: 'reviewer',
        photo: 'https://cdn.test/reviewer.png',
        biography: 'Docs reviewer',
      },
      content: '# Roadmap',
      publishLink: 'https://hackmd.io/s/note-id',
      shortId: 'short-id',
      permalink: 'https://hackmd.io/@team/short-id',
      teamPath: 'engineering',
      userPath: 'michael',
      publishType: 'view',
      readPermission: 'guest',
      writePermission: 'signed_in',
      folderPaths: [
        {
          id: 'folder-id',
          name: 'Projects',
          icon: 'folder',
          color: '#27a',
          parentId: 'root',
          clientId: 'local-folder',
        },
      ],
    });

    expect(note).toMatchObject({
      id: 'note-id',
      title: 'Roadmap',
      description: 'Q2 plan',
      tags: ['planning', 'team'],
      updatedAtMillis: 1_700_000_000_000,
      createdAtMillis: 1_700_000_000_500,
      publishedAtMillis: 1_700_000_010_000,
      tagsUpdatedAtMillis: 1_700_000_020_000,
      titleUpdatedAtMillis: 1_700_000_030_000,
      content: '# Roadmap',
      publishLink: 'https://hackmd.io/s/note-id',
      shortId: 'short-id',
      permalink: 'https://hackmd.io/@team/short-id',
      teamPath: 'engineering',
      userPath: 'michael',
      publishType: 'view',
      readPermission: 'guest',
      writePermission: 'signed_in',
      lastChangeUser: {
        name: 'Reviewer',
        username: 'reviewer',
        photo: 'https://cdn.test/reviewer.png',
        biography: 'Docs reviewer',
      },
    });
    expect(note.folderPaths[0]).toEqual({
      id: 'folder-id',
      name: 'Projects',
      icon: 'folder',
      color: '#27a',
      parentId: 'root',
      clientId: 'local-folder',
    });
  });

  it('maps swagger Team and User fields', () => {
    expect(mapTeam({
      id: 'team-id',
      ownerId: 'owner-id',
      name: 'Engineering',
      logo: 'https://cdn.test/logo.png',
      path: 'engineering',
      description: 'Product engineering',
      visibility: 'public',
      upgraded: true,
      createdAt: 1_700_000_000,
    })).toEqual({
      id: 'team-id',
      ownerId: 'owner-id',
      name: 'Engineering',
      logo: 'https://cdn.test/logo.png',
      path: 'engineering',
      description: 'Product engineering',
      visibility: 'public',
      upgraded: true,
      createdAtMillis: 1_700_000_000_000,
    });

    expect(mapUser({
      id: 'user-id',
      email: 'user@example.com',
      name: 'Michael',
      userPath: 'michael',
      photo: 'https://cdn.test/me.png',
      upgraded: true,
      teams: [{ id: 'team-id', path: 'engineering', name: 'Engineering' }],
    })).toMatchObject({
      id: 'user-id',
      email: 'user@example.com',
      name: 'Michael',
      username: 'michael',
      photo: 'https://cdn.test/me.png',
      upgraded: true,
      teams: [{ id: 'team-id', path: 'engineering', name: 'Engineering' }],
    });
  });

  it('maps OpenAPI folder fields to FolderSummary', () => {
    expect(mapFolder({
      id: 'folder-1',
      name: 'Projects',
      description: 'Active work',
      icon: '1F525',
      color: '#FF6B6B',
      parentFolderId: 'root-folder',
      createdAt: 1_700_000_000,
      updatedAt: 1_700_000_050,
    })).toEqual({
      id: 'folder-1',
      name: 'Projects',
      description: 'Active work',
      icon: '1F525',
      color: '#FF6B6B',
      parentId: 'root-folder',
      clientId: null,
      createdAtMillis: 1_700_000_000_000,
      updatedAtMillis: 1_700_000_050_000,
    });
  });

  it('normalizes timestamps, nested note responses, and common HackMD errors', () => {
    expect(toMillis(1_700_000_000)).toBe(1_700_000_000_000);
    expect(toMillis(1_700_000_000_500)).toBe(1_700_000_000_500);
    expect(toMillis('1700000000')).toBe(1_700_000_000_000);
    expect(toMillis('not-a-date')).toBeNull();
    expect(normalizeHackmdResponse({ note: { id: 'nested' } })).toEqual({ id: 'nested' });
    expect(getHackmdErrorMessage(401, 'Unauthorized')).toBe('Your HackMD API token is invalid or expired.');
    expect(getHackmdErrorMessage(429, 'Too Many Requests')).toContain('rate limiting');
  });

  it('explains HackMD error bodies without hiding auth and server failures', () => {
    expect(getHackmdErrorMessage(429, 'Too Many Requests', {
      error: { code: 'quota_exceeded', message: 'Free plan note limit reached.', upgradeUrl: 'https://hackmd.io/pricing', helpUrl: 'https://hackmd.io/help' },
    })).toBe('Your HackMD workspace has reached its quota. Free plan note limit reached.');
    expect(getHackmdErrorMessage(429, 'Too Many Requests', { error: 'Too many requests' })).toContain('rate limiting');
    expect(getHackmdErrorMessage(422, 'Unprocessable Entity', {
      message: 'Validation Failed',
      details: { title: { message: 'Title is too long', value: 'x' }, permalink: { message: 'Invalid permalink' } },
    })).toBe('HackMD rejected the request: title: Title is too long; permalink: Invalid permalink');
    expect(getHackmdErrorMessage(409, 'Conflict', { error: 'Permalink is already taken' }))
      .toBe('HackMD rejected the request: Permalink is already taken');
    expect(getHackmdErrorMessage(400, 'Bad Request', { error_code: 'invalid_base', message: 'Unknown version' }))
      .toBe('HackMD rejected the request: Unknown version');
    expect(getHackmdErrorMessage(413, 'Payload Too Large')).toBe('The file is too large for HackMD.');
    expect(getHackmdErrorMessage(400, 'Bad Request', { error: 'x'.repeat(400) })).toHaveLength('HackMD rejected the request: '.length + 301);
    expect(getHackmdErrorMessage(401, 'Unauthorized', { error: 'token abc' })).toBe('Your HackMD API token is invalid or expired.');
    expect(getHackmdErrorMessage(500, 'Internal Server Error', { error: 'stack trace' })).toContain('having trouble');
  });
});

describe('hackmd-service request mapping', () => {
  it('maps list/get/history requests with auth headers and escaped path segments', async () => {
    const { calls, service } = createService([
      jsonResponse([{ id: 'history-note', title: 'History', lastChangedAt: 300 }]),
      jsonResponse({ id: 'note/id?', title: 'Escaped', content: '# Escaped' }),
    ]);

    const history = await service.listHistory(25);
    const note = await service.getNote('note/id?');

    expect(calls[0].url).toBe('https://api.test/v1/history?limit=25');
    expect(calls[0].init.headers).toMatchObject({ Authorization: 'Bearer test-token' });
    expect(calls[1].url).toBe('https://api.test/v1/notes/note%2Fid%3F');
    expect(history).toMatchObject({ source: 'remote', data: [{ id: 'history-note' }] });
    expect(note).toMatchObject({ source: 'remote', data: { id: 'note/id?', content: '# Escaped' } });
  });

  it('reports a missing note only for 404, keeping other read failures temporary', async () => {
    const { service } = createService([
      jsonResponse({ id: 'cached', title: 'Cached', content: 'Cached body' }),
      jsonResponse({ message: 'Not Found' }, { status: 404, statusText: 'Not Found' }),
      ...Array.from({ length: 3 }, () => jsonResponse({ message: 'Unavailable' }, { status: 503, statusText: 'Service Unavailable' })),
    ]);

    await service.getNote('cached');
    expect(await service.getNote('cached')).toEqual({
      source: 'error',
      error: HACKMD_NOTE_NOT_FOUND_MESSAGE,
      data: expect.objectContaining({ id: 'cached' }),
    });
    expect(await service.getNote('other')).toEqual({ source: 'error', error: expect.stringContaining('having trouble') });
  });

  it('maps team note creation body and nested note response', async () => {
    const { calls, service } = createService([
      jsonResponse({ note: { id: 'team-note', title: 'Team Note', content: '# Team Note', teamPath: 'engineering' } }),
    ]);

    const created = await service.createTeamNote('engineering', {
      title: 'Team Note',
      content: '# Team Note',
      parentFolderId: 'folder-1',
    });

    expect(calls[0].url).toBe('https://api.test/v1/teams/engineering/notes');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      title: 'Team Note',
      content: '# Team Note',
      parentFolderId: 'folder-1',
    });
    expect(created).toMatchObject({
      id: 'team-note',
      title: 'Team Note',
      content: '# Team Note',
      teamPath: 'engineering',
    });
  });

  it('maps full note creation fields and image upload multipart body', async () => {
    const { calls, service } = createService([
      jsonResponse({ note: { id: 'note-1', title: 'Spec', content: '# Spec' } }),
      jsonResponse({ data: { link: 'https://cdn.test/spec.png' } }),
    ]);

    await service.createNote({
      title: 'Spec',
      description: 'API spec',
      tags: ['api', 'desktop'],
      content: '# Spec',
      readPermission: 'signed_in',
      writePermission: 'owner',
      commentPermission: 'signed_in_users',
      suggestEditPermission: 'owners',
      noteFeatures: { custom: true },
      permalink: 'spec',
      parentFolderId: 'folder-1',
      origin: 'hackdesk',
    });
    const upload = await service.uploadNoteImage('note-1', {
      fileName: 'diagram.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]).buffer,
    });

    expect(calls[0].url).toBe('https://api.test/v1/notes');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      title: 'Spec',
      description: 'API spec',
      tags: ['api', 'desktop'],
      content: '# Spec',
      readPermission: 'signed_in',
      writePermission: 'owner',
      commentPermission: 'signed_in_users',
      suggestEditPermission: 'owners',
      noteFeatures: { custom: true },
      permalink: 'spec',
      parentFolderId: 'folder-1',
      origin: 'hackdesk',
    });
    expect(calls[1].url).toBe('https://api.test/v1/notes/note-1/images');
    expect(calls[1].init.method).toBe('POST');
    expect(calls[1].init.body).toBeInstanceOf(FormData);
    expect(calls[1].init.headers).toMatchObject({ Authorization: 'Bearer test-token' });
    expect(calls[1].init.headers).not.toHaveProperty('Content-Type');
    expect((calls[1].init.body as FormData).get('image')).toBeTruthy();
    expect(upload).toEqual({ link: 'https://cdn.test/spec.png' });
  });

  it('fetches the note after PATCH returns 202 without a body', async () => {
    const { calls, service } = createService([
      textResponse('', { status: 202 }),
      jsonResponse({ id: 'note-1', title: 'Updated', content: '# Updated' }),
    ]);

    const updated = await service.updateNote('note-1', {
      title: 'Updated',
      content: '# Updated',
      parentFolderId: 'folder-2',
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://api.test/v1/notes/note-1');
    expect(calls[0].init.method).toBe('PATCH');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      title: 'Updated',
      content: '# Updated',
      parentFolderId: 'folder-2',
    });
    expect(calls[1].url).toBe('https://api.test/v1/notes/note-1');
    expect(calls[1].init.method).toBeUndefined();
    expect(updated).toMatchObject({ id: 'note-1', title: 'Updated', content: '# Updated' });
  });

  it('keeps the ETag from note reads and skips the body on 304', async () => {
    const { calls, service } = createService([
      jsonResponse({ id: 'note-1', title: 'Note', content: 'Body' }, { headers: { ETag: 'W/"1"' } }),
      new Response(null, { status: 304, headers: { ETag: 'W/"1"' } }),
      jsonResponse({ id: 'note-1', title: 'Note', content: 'Changed' }, { headers: { ETag: 'W/"2"' } }),
      jsonResponse({ message: 'Not Found' }, { status: 404, statusText: 'Not Found' }),
    ]);

    expect(await service.getNote('note-1')).toMatchObject({ source: 'remote', data: { content: 'Body', etag: 'W/"1"' } });
    expect(await service.getNoteIfChanged('note-1', null, 'W/"1"')).toBeNull();
    expect(calls[1].init.headers).toMatchObject({ Authorization: 'Bearer test-token', 'If-None-Match': 'W/"1"' });
    expect(await service.getNoteIfChanged('note-1', 'team a', 'W/"1"')).toMatchObject({ content: 'Changed', etag: 'W/"2"' });
    expect(calls[2].url).toBe('https://api.test/v1/teams/team%20a/notes/note-1');
    await expect(service.getNoteIfChanged('note-1', null, 'W/"2"')).rejects.toThrow(HACKMD_NOTE_NOT_FOUND_MESSAGE);
  });

  it('fails a conditional read that is not 304 and has no note', async () => {
    const { service } = createService([textResponse('', { status: 200 })]);

    await expect(service.getNoteIfChanged('note-1', null, 'W/"1"')).rejects.toThrow('HackMD returned an empty note.');
  });

  it('keeps the ETag from the read after a 202 PATCH', async () => {
    const { service } = createService([
      textResponse('', { status: 202 }),
      jsonResponse({ id: 'note-1', title: 'Note', content: 'Saved' }, { headers: { ETag: 'W/"3"' } }),
    ]);

    await expect(service.updateNote('note-1', { content: 'Saved' })).resolves.toMatchObject({ content: 'Saved', etag: 'W/"3"' });
  });

  it('restores a personal note from the trash', async () => {
    const { calls, service } = createService([textResponse('', { status: 204 })]);

    await service.restoreNote('note/1');
    expect(calls[0].url).toBe('https://api.test/v1/trash/note%2F1/restore');
    expect(calls[0].init.method).toBe('PUT');
  });

  it('lists the trash newest first with seconds and nullable removal dates', async () => {
    const { calls, service } = createService([jsonResponse([
      { id: 'old', title: 'Old', tags: ['a', 1], deletedAt: 1_760_000_000, ownerId: 'u', teamId: null, shortId: 's1', publishType: 'edit', permanentDeletedAt: 1_762_592_000 },
      { id: 'new', title: '', tags: [], deletedAt: 1_760_500_000_000, ownerId: 'u', teamId: null, shortId: 's2', publishType: 'view', permanentDeletedAt: null },
    ])]);

    await expect(service.listTrash()).resolves.toEqual([
      { id: 'new', title: '', tags: [], deletedAtMillis: 1_760_500_000_000, permanentDeleteAtMillis: null },
      { id: 'old', title: 'Old', tags: ['a'], deletedAtMillis: 1_760_000_000_000, permanentDeleteAtMillis: 1_762_592_000_000 },
    ]);
    expect(calls[0].url).toBe('https://api.test/v1/trash');
  });

  it('restores notes in one batch and reads a 207 partial result', async () => {
    const { calls, service } = createService([jsonResponse({
      'note-1': { status: 'success' },
      'note-2': { status: 'failure', reason: 'NOT_FOUND' },
      'note-3': { status: 'failure', reason: 'SOMETHING_NEW' },
      extra: { status: 'success' },
    }, { status: 207 })]);

    await expect(service.restoreNotes(['note-1', 'note-2', 'note-3', 'note-4'])).resolves.toEqual({
      'note-1': { status: 'success' },
      'note-2': { status: 'failure', reason: 'NOT_FOUND' },
      'note-3': { status: 'failure', reason: 'UNKNOWN' },
      'note-4': { status: 'failure', reason: 'UNKNOWN' },
    });
    expect(calls[0].url).toBe('https://api.test/v1/trash/batch-restore');
    expect(calls[0].init.method).toBe('PUT');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ noteIds: ['note-1', 'note-2', 'note-3', 'note-4'] });
  });

  it('does not retry a failed batch restore', async () => {
    const { calls, service } = createService([
      jsonResponse({ message: 'Unavailable' }, { status: 503, statusText: 'Service Unavailable' }),
    ]);

    await expect(service.restoreNotes(['note-1'])).rejects.toThrow('having trouble');
    expect(calls).toHaveLength(1);
  });

  it('drops cached notes and the restored note after a batch restore', async () => {
    const failure = () => jsonResponse({ message: 'Bad' }, { status: 400, statusText: 'Bad Request' });
    const { service } = createService([
      jsonResponse([{ id: 'kept', title: 'Kept' }]),
      jsonResponse({ id: 'note-1', title: 'Gone', content: 'Body' }),
      jsonResponse({ 'note-1': { status: 'success' } }),
      failure(),
      failure(),
    ]);

    await service.listNotes();
    await service.getNote('note-1');
    await service.restoreNotes(['note-1']);
    expect(await service.listNotes()).toEqual({ source: 'error', error: expect.any(String) });
    expect(await service.getNote('note-1')).toEqual({ source: 'error', error: expect.any(String) });
  });

  it('returns the created note from a 207 partial create', async () => {
    const { service } = createService([
      jsonResponse({ note: { id: 'partial', title: 'Partial', content: '' }, error: 'Folder not found' }, { status: 207 }),
    ]);

    await expect(service.createNote({ title: 'Partial', parentFolderId: 'missing' })).resolves.toMatchObject({ id: 'partial' });
  });

  it('surfaces the reason from a failed write', async () => {
    const { service } = createService([
      jsonResponse({
        error: { code: 'quota_exceeded', message: 'Note limit reached.', upgradeUrl: 'https://hackmd.io/pricing', helpUrl: 'https://hackmd.io/help' },
      }, { status: 429, statusText: 'Too Many Requests' }),
      textResponse('not json', { status: 409, statusText: 'Conflict' }),
    ]);

    await expect(service.createNote({ title: 'Over quota' })).rejects.toThrow('Your HackMD workspace has reached its quota. Note limit reached.');
    await expect(service.updateNote('note-1', { permalink: 'taken' })).rejects.toThrow('HackMD returned 409 Conflict.');
  });

  it('maps team PATCH and DELETE requests', async () => {
    const { calls, service } = createService([
      jsonResponse({ note: { id: 'note-1', title: 'Team Updated', content: '# Team Updated' } }),
      textResponse('', { status: 204 }),
    ]);

    await service.updateTeamNote('engineering', 'note-1', {
      title: 'Team Updated',
      content: '# Team Updated',
      description: 'Updated description',
      tags: ['team'],
      permalink: 'team-updated',
      readPermission: 'signed_in',
      writePermission: 'owner',
      parentFolderId: 'folder-2',
    });
    await service.deleteTeamNote('engineering', 'note-1');

    expect(calls[0].url).toBe('https://api.test/v1/teams/engineering/notes/note-1');
    expect(calls[0].init.method).toBe('PATCH');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      title: 'Team Updated',
      content: '# Team Updated',
      description: 'Updated description',
      tags: ['team'],
      permalink: 'team-updated',
      readPermission: 'signed_in',
      writePermission: 'owner',
      parentFolderId: 'folder-2',
    });
    expect(calls[1].url).toBe('https://api.test/v1/teams/engineering/notes/note-1');
    expect(calls[1].init.method).toBe('DELETE');
  });

  it('validates a token without reading the stored token', async () => {
    const mock = createFetchMock([
      jsonResponse({
        id: 'user-id',
        name: 'Michael',
        userPath: 'michael',
        photo: '',
        email: 'michael@example.com',
        teams: [],
      }),
    ]);
    const readToken = vi.fn(async () => 'stored-token');
    const service = createHackmdService({
      baseUrl: 'https://api.test/v1',
      timeoutMs: 1000,
      fetcher: mock.fetcher,
      readToken,
    });

    const user = await service.validateToken(' pasted-token ');

    expect(readToken).not.toHaveBeenCalled();
    expect(mock.calls[0].url).toBe('https://api.test/v1/me');
    expect(mock.calls[0].init.headers).toMatchObject({ Authorization: 'Bearer pasted-token' });
    expect(user).toMatchObject({ id: 'user-id', username: 'michael' });
  });

  it('maps folder list/create/order/update/delete requests', async () => {
    const { calls, service } = createService([
      jsonResponse([{ id: 'folder-2', name: 'Zeta' }, { id: 'folder-1', name: 'Alpha' }]),
      jsonResponse({ root: ['folder-1'] }),
      jsonResponse({ id: 'folder-1', name: 'Alpha', description: 'Personal folder' }),
      jsonResponse({ id: 'team-folder', name: 'Team Folder' }),
      jsonResponse({ folder: { id: 'folder-3', name: 'Roadmap', parentFolderId: 'folder-1' } }),
      textResponse('', { status: 204 }),
      jsonResponse({ id: 'folder-3', name: 'Roadmap Updated', description: 'Updated', icon: '1F4C1', color: '#2F80ED' }),
      jsonResponse({ id: 'folder-3', name: 'Team Roadmap Updated' }),
      textResponse('', { status: 204 }),
    ]);

    const folders = await service.listFolders();
    const order = await service.getFolderOrder();
    const personalFolder = await service.getFolder('folder-1');
    const teamFolder = await service.getTeamFolder('engineering', 'team-folder');
    const created = await service.createFolder({ name: 'Roadmap', parentFolderId: 'folder-1' });
    await service.updateFolderOrder({ root: ['folder-1', 'folder-3'] });
    const updated = await service.updateFolder('folder-3', {
      name: 'Roadmap Updated',
      description: 'Updated',
      icon: '1F4C1',
      color: '#2F80ED',
      parentFolderId: null,
    });
    const updatedTeam = await service.updateTeamFolder('engineering', 'folder-3', { name: 'Team Roadmap Updated' });
    await service.deleteTeamFolder('engineering', 'folder-3');

    expect(folders).toMatchObject({
      source: 'remote',
      data: [{ id: 'folder-1', name: 'Alpha' }, { id: 'folder-2', name: 'Zeta' }],
    });
    expect(order).toEqual({ source: 'remote', data: { root: ['folder-1'] } });
    expect(personalFolder).toMatchObject({ source: 'remote', data: { id: 'folder-1', description: 'Personal folder' } });
    expect(teamFolder).toMatchObject({ source: 'remote', data: { id: 'team-folder', name: 'Team Folder' } });
    expect(created).toMatchObject({ id: 'folder-3', name: 'Roadmap', parentId: 'folder-1' });
    expect(updated).toMatchObject({ id: 'folder-3', name: 'Roadmap Updated', description: 'Updated' });
    expect(updatedTeam).toMatchObject({ id: 'folder-3', name: 'Team Roadmap Updated' });
    expect(calls[0].url).toBe('https://api.test/v1/folders');
    expect(calls[1].url).toBe('https://api.test/v1/folders/folder-order');
    expect(calls[2].url).toBe('https://api.test/v1/folders/folder-1');
    expect(calls[3].url).toBe('https://api.test/v1/teams/engineering/folders/team-folder');
    expect(calls[4].url).toBe('https://api.test/v1/folders');
    expect(calls[4].init.method).toBe('POST');
    expect(JSON.parse(String(calls[4].init.body))).toEqual({
      name: 'Roadmap',
      parentFolderId: 'folder-1',
    });
    expect(calls[5].url).toBe('https://api.test/v1/folders/folder-order');
    expect(calls[5].init.method).toBe('PUT');
    expect(JSON.parse(String(calls[5].init.body))).toEqual({
      order: { root: ['folder-1', 'folder-3'] },
    });
    expect(calls[6].url).toBe('https://api.test/v1/folders/folder-3');
    expect(calls[6].init.method).toBe('PATCH');
    expect(JSON.parse(String(calls[6].init.body))).toEqual({
      name: 'Roadmap Updated',
      description: 'Updated',
      icon: '1F4C1',
      color: '#2F80ED',
      parentFolderId: null,
    });
    expect(calls[7].url).toBe('https://api.test/v1/teams/engineering/folders/folder-3');
    expect(calls[7].init.method).toBe('PATCH');
    expect(calls[8].url).toBe('https://api.test/v1/teams/engineering/folders/folder-3');
    expect(calls[8].init.method).toBe('DELETE');
  });

  it('returns cached data with an error source when refresh fails', async () => {
    const cacheKey = 'note:cached-test-note';
    await withCache(cacheKey, Promise.resolve({ id: 'cached-test-note' }));

    const result = await withCache(
      cacheKey,
      Promise.reject(new Error('HackMD is offline.')),
    );

    expect(result).toEqual({
      source: 'error',
      error: 'HackMD is offline.',
      data: { id: 'cached-test-note' },
    });
  });

  it('does not share cached account data between service instances', async () => {
    const accountA = createHackmdService({
      baseUrl: 'https://api.test/v1',
      readToken: async () => 'token-a',
      fetcher: vi.fn(async () => jsonResponse([{ id: 'note-a', title: 'Account A' }])) as typeof fetch,
    });
    const accountB = createHackmdService({
      baseUrl: 'https://api.test/v1',
      readToken: async () => 'token-b',
      fetcher: vi.fn(async () => { throw new Error('offline'); }) as typeof fetch,
    });

    await expect(accountA.listNotes()).resolves.toMatchObject({ source: 'remote' });
    await expect(accountB.listNotes()).resolves.toEqual({ source: 'error', error: 'offline' });
  });
});

describe('hackmd-service note versions', () => {
  const named = {
    id: 'v-2', name: 'Before launch', name_source: 'user', description: 'Ready', created_at: '2026-10-14T10:30:00.000Z',
    created_by: { user_id: 'u-1', display_name: 'Michael', photo: 'https://cdn.test/m.png' }, authorship: [], content_available: true,
  };
  const automatic = {
    id: 'v-1', name: '', name_source: 'system', description: null, created_at: '2026-10-13T08:00:00Z',
    created_by: null, authorship: [], content_available: false,
  };

  it('reads ISO timestamps as well as epoch values', () => {
    expect(parseTimestamp('2026-10-14T10:30:00.000Z')).toBe(Date.UTC(2026, 9, 14, 10, 30));
    expect(parseTimestamp(1_700_000_000)).toBe(1_700_000_000_000);
    expect(parseTimestamp('not a date')).toBeNull();
  });

  it('lists a page of versions with the requested filters', async () => {
    const { calls, service } = createService([
      jsonResponse({ data: [named, automatic], meta: { page: 2, total_pages: 3, total: 45, limit: 20 } }),
    ]);

    const page = await service.listNoteVersions('note/1', { namedOnly: true, page: 2, limit: 20 });

    expect(calls[0].url).toBe('https://api.test/v1/notes/note%2F1/versions?named_only=true&page=2&limit=20');
    expect(page).toEqual({
      page: 2,
      totalPages: 3,
      total: 45,
      versions: [
        {
          id: 'v-2', name: 'Before launch', nameSource: 'user', description: 'Ready', createdAtMillis: Date.UTC(2026, 9, 14, 10, 30),
          createdBy: { userId: 'u-1', displayName: 'Michael', photo: 'https://cdn.test/m.png' }, contentAvailable: true,
        },
        {
          id: 'v-1', name: '', nameSource: 'system', description: null, createdAtMillis: Date.UTC(2026, 9, 13, 8),
          createdBy: null, contentAvailable: false,
        },
      ],
    });
  });

  it('reads a version and its content only when HackMD has it', async () => {
    const { calls, service } = createService([
      jsonResponse({ ...named, content: '# Before' }),
      jsonResponse({ ...automatic, content: 'stale' }),
    ]);

    await expect(service.getNoteVersion('note-1', 'v-2')).resolves.toMatchObject({ id: 'v-2', content: '# Before' });
    await expect(service.getNoteVersion('note-1', 'v-1')).resolves.toMatchObject({ id: 'v-1', content: null });
    expect(calls[0].url).toBe('https://api.test/v1/notes/note-1/versions/v-2');
  });

  it('compares a version with the live note', async () => {
    const { calls, service } = createService([jsonResponse({ unified_diff: '@@ -1 +1 @@\n-a\n+b\n' })]);

    await expect(service.compareNoteVersions('note-1', 'version:v-2', 'note_content')).resolves.toEqual({ unifiedDiff: '@@ -1 +1 @@\n-a\n+b\n' });
    expect(calls[0].url).toBe('https://api.test/v1/notes/note-1/versions/compare?base=version%3Av-2&target=note_content');
  });

  it.each([403, 404])('reports version history as unavailable on %i', async (status) => {
    const { service } = createService([jsonResponse({ error_code: 'forbidden', message: 'No access' }, { status, statusText: 'Nope' })]);

    await expect(service.listNoteVersions('note-1', {})).rejects.toThrow(HACKMD_NOTE_VERSIONS_UNAVAILABLE_MESSAGE);
  });

  it('names the current content as a version, sent once', async () => {
    const { calls, service } = createService([jsonResponse(named, { status: 201 })]);

    await expect(service.createNoteVersion('note-1', { name: 'Before launch', description: 'Ready' }))
      .resolves.toEqual({ status: 'created', version: expect.objectContaining({ id: 'v-2', nameSource: 'user' }) });
    expect(calls[0].url).toBe('https://api.test/v1/notes/note-1/versions');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ base: 'note_content', name: 'Before launch', description: 'Ready' });
  });

  it('reports the conflicts HackMD returns instead of failing', async () => {
    const { service } = createService([
      jsonResponse({ error_code: 'no_content_change', message: 'Nothing new', latest_version_id: 'v-2', latest_name_source: 'user' }, { status: 409, statusText: 'Conflict' }),
      jsonResponse({ error_code: 'version_already_named', message: 'Named', version_id: 'v-3', name: 'x' }, { status: 409, statusText: 'Conflict' }),
    ]);

    await expect(service.createNoteVersion('note-1', { name: 'Again' })).resolves.toEqual({ status: 'no_content_change', latestVersionId: 'v-2' });
    await expect(service.createNoteVersion('note-1', { name: 'Again' })).resolves.toEqual({ status: 'version_already_named', latestVersionId: 'v-3' });
  });

  it('does not retry a failed version write', async () => {
    const { calls, service } = createService([
      jsonResponse({ message: 'Unavailable' }, { status: 503, statusText: 'Service Unavailable' }),
    ]);

    await expect(service.createNoteVersion('note-1', { name: 'x' })).rejects.toThrow('having trouble');
    expect(calls).toHaveLength(1);
  });

  it('retries a version read after a transient failure', async () => {
    const { calls, service } = createService([
      jsonResponse({ message: 'Unavailable' }, { status: 503, statusText: 'Service Unavailable', headers: { 'Retry-After': '0' } }),
      jsonResponse({ data: [], meta: { page: 1, total_pages: 1, total: 0 } }),
    ]);

    await expect(service.listNoteVersions('note-1', {})).resolves.toMatchObject({ versions: [], totalPages: 1 });
    expect(calls).toHaveLength(2);
  });
});

describe('hackmd-service fallback cache consistency', () => {
  type Route = (url: string, init: RequestInit) => Response | Promise<Response>;

  function createRoutedService(route: { current: Route }) {
    return createHackmdService({
      baseUrl: 'https://api.test/v1',
      timeoutMs: 1000,
      fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => route.current(String(input), init ?? {})) as typeof fetch,
      readToken: async () => 'test-token',
    });
  }

  const offline: Route = () => { throw new Error('offline'); };
  const note = (id: string, title = id) => ({ id, title, content: `${title} body` });
  const okRoute = (byPath: Record<string, unknown>): Route => (url, init) => {
    const path = url.replace('https://api.test/v1', '');
    if (init.method && init.method !== 'GET') return init.method === 'DELETE' ? textResponse('', { status: 204 }) : jsonResponse(note('n1', 'Updated'));
    if (!(path in byPath)) throw new Error(`Unexpected ${path}`);
    return jsonResponse(byPath[path]);
  };

  it('keeps separate fallback values for different history limits', async () => {
    const route = { current: okRoute({ '/history?limit=20': [note('a')], '/history?limit=50': [note('a'), note('b')] }) };
    const service = createRoutedService(route);
    await service.listHistory(20);
    await service.listHistory(50);
    route.current = offline;
    expect((await service.listHistory(20)).data?.map((item) => item.id)).toEqual(['a']);
    expect((await service.listHistory(50)).data?.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it.each([
    ['update', (service: ReturnType<typeof createHackmdService>) => service.updateNote('n1', { content: 'Updated' })],
    ['delete', (service: ReturnType<typeof createHackmdService>) => service.deleteNote('n1')],
  ])('invalidates note lists, the document and history after %s', async (_, mutate) => {
    const route = { current: okRoute({ '/notes': [note('n1')], '/notes/n1': note('n1'), '/history?limit=20': [note('n1')] }) };
    const service = createRoutedService(route);
    await Promise.all([service.listNotes(), service.getNote('n1'), service.listHistory(20)]);
    await mutate(service);
    route.current = offline;
    expect(await service.listNotes()).toEqual({ source: 'error', error: 'offline' });
    expect(await service.getNote('n1')).toEqual({ source: 'error', error: 'offline' });
    expect(await service.listHistory(20)).toEqual({ source: 'error', error: 'offline' });
  });

  it('invalidates team note lists, the team document and history after a team update', async () => {
    const route = { current: okRoute({ '/teams/design/notes': [note('n1')], '/teams/design/notes/n1': note('n1'), '/history?limit=20': [note('n1')], '/notes': [note('other')] }) };
    const service = createRoutedService(route);
    await Promise.all([service.listTeamNotes('design'), service.getNote('n1', 'design'), service.listHistory(20), service.listNotes()]);
    await service.updateTeamNote('design', 'n1', { content: 'Updated' });
    route.current = offline;
    expect(await service.listTeamNotes('design')).toEqual({ source: 'error', error: 'offline' });
    expect(await service.getNote('n1', 'design')).toEqual({ source: 'error', error: 'offline' });
    expect(await service.listHistory(20)).toEqual({ source: 'error', error: 'offline' });
    expect((await service.listNotes()).data?.map((item) => item.id)).toEqual(['other']);
  });

  it.each([
    ['started before the mutation', 'before'],
    ['started while the mutation is in flight', 'during'],
  ])('does not let a late list response %s restore stale data', async (_, timing) => {
    let releaseList!: () => void;
    let releaseUpdate!: () => void;
    const listGate = new Promise<void>((done) => { releaseList = done; });
    const updateGate = new Promise<void>((done) => { releaseUpdate = done; });
    const route = { current: (async (_url: string, init: RequestInit) => {
      if (init.method === 'PATCH') { await updateGate; return jsonResponse(note('n1', 'Updated')); }
      await listGate;
      return jsonResponse([note('n1', 'Stale')]);
    }) as Route };
    const service = createRoutedService(route);
    let list!: ReturnType<typeof service.listNotes>;
    if (timing === 'before') list = service.listNotes();
    const update = service.updateNote('n1', { content: 'Updated' });
    if (timing === 'during') list = service.listNotes();
    releaseList();
    await list;
    releaseUpdate();
    await update;
    route.current = offline;
    expect(await service.listNotes()).toEqual({ source: 'error', error: 'offline' });
  });

  it('does not cache a response from the previous credentials after the cache is cleared', async () => {
    let release!: () => void;
    const gate = new Promise<void>((done) => { release = done; });
    const route = { current: (async () => { await gate; return jsonResponse([note('old-account')]); }) as Route };
    const service = createRoutedService(route);
    const list = service.listNotes();
    service.clearCache();
    release();
    await list;
    route.current = offline;
    expect(await service.listNotes()).toEqual({ source: 'error', error: 'offline' });
  });
});
