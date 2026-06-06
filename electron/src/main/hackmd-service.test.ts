import { describe, expect, it, vi } from 'vitest';

import {
  createHackmdService,
  getHackmdErrorMessage,
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
      content: '# Roadmap',
      publishLink: 'https://hackmd.io/s/note-id',
      shortId: 'short-id',
      permalink: 'https://hackmd.io/@team/short-id',
      teamPath: 'engineering',
      userPath: 'michael',
      publishType: 'view',
      readPermission: 'guest',
      writePermission: 'signed_in',
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
    });
    await service.deleteTeamNote('engineering', 'note-1');

    expect(calls[0].url).toBe('https://api.test/v1/teams/engineering/notes/note-1');
    expect(calls[0].init.method).toBe('PATCH');
    expect(calls[1].url).toBe('https://api.test/v1/teams/engineering/notes/note-1');
    expect(calls[1].init.method).toBe('DELETE');
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
});
