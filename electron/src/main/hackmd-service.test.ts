import { describe, expect, it, vi } from 'vitest';
import { HACKMD_NOTE_NOT_FOUND_MESSAGE } from '../../../src/lib/note-errors';

import {
  createHackmdService,
  getHackmdErrorMessage,
  mapFolder,
  mapNote,
  mapTeam,
  mapUser,
  normalizeHackmdResponse,
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
      jsonResponse({ message: 'Unavailable' }, { status: 503, statusText: 'Service Unavailable' }),
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

  it('fetches the note after PATCH returns an empty body', async () => {
    const { calls, service } = createService([
      textResponse('', { status: 200 }),
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
    const route = { current: (async (url: string, init: RequestInit) => {
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
