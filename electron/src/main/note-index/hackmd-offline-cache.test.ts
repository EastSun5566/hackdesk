import { describe, expect, it } from 'vitest';

import { createHackmdService } from '../hackmd-service';
import { createHackmdOfflineCache } from './hackmd-offline-cache';
import { openNoteStore } from './note-store';

type Routes = Record<string, unknown>;

/** A HackMD API that answers from `routes` while online and fails like a dropped connection offline. */
function fakeHackmd(routes: Routes) {
  const state = { online: true };
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    if (!state.online) throw new TypeError('fetch failed');
    const path = new URL(String(input)).pathname.replace('/v1', '');
    const method = init?.method ?? 'GET';
    const body = routes[`${method} ${path}`];
    if (body === undefined) return new Response('{"message":"Not found"}', { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json', ETag: '"e1"' } });
  }) as typeof fetch;
  return { state, fetcher };
}

const note = (id: string, content: string) => ({ id, title: `Title ${id}`, content, tags: [], lastChangedAt: 1 });

/** A fresh service over the same store, as after restarting the app. */
function restart(store: ReturnType<typeof openNoteStore>, fetcher: typeof fetch) {
  const service = createHackmdService({ baseUrl: 'https://api.test/v1', fetcher, readToken: async () => 'token', readAttempts: 1, timeoutMs: 1000 });
  const cache = createHackmdOfflineCache(store);
  service.setDurableFallback(cache);
  return { service, cache };
}

describe('HackMD offline cache', () => {
  it('serves opened notes and lists after a restart without a connection', async () => {
    const store = openNoteStore(':memory:');
    const api = fakeHackmd({
      'GET /me': { id: 'user-1', name: 'Fixture' },
      'GET /notes': [note('n1', ''), note('n2', '')],
      'GET /notes/n1': note('n1', 'Offline body text'),
    });
    const online = restart(store, api.fetcher).service;
    await online.getCurrentUser();
    await online.listNotes();
    expect(await online.getNote('n1')).toMatchObject({ source: 'remote' });

    api.state.online = false;
    const offline = restart(store, api.fetcher).service;
    expect(await offline.listNotes()).toMatchObject({ source: 'error', data: [{ id: 'n1' }, { id: 'n2' }] });
    expect(await offline.getNote('n1')).toMatchObject({ source: 'error', data: { id: 'n1', content: 'Offline body text', etag: '"e1"' } });
    // Never opened, so never downloaded.
    expect(await offline.getNote('n2')).toMatchObject({ source: 'error' });
    expect((await offline.getNote('n2')).data).toBeUndefined();
    expect(store.search({ query: 'body text', source: 'hackmd', workspace: 'personal' }).matches.map(match => match.noteId)).toEqual(['n1']);
  });

  it('keeps the saved text of a note, and forgets notes HackMD no longer lists', async () => {
    const store = openNoteStore(':memory:');
    const routes: Routes = {
      'GET /notes/n1': note('n1', 'before'),
      'PATCH /notes/n1': note('n1', 'after the save'),
      'GET /teams/team-a/notes/t1': note('t1', 'team text'),
      'GET /teams/team-a/notes': [note('t2', '')],
    };
    const api = fakeHackmd(routes);
    const { service } = restart(store, api.fetcher);
    await service.getNote('n1');
    await service.updateNote('n1', { content: 'after the save' });
    expect(store.getNote('hackmd', 'personal', 'n1')?.content).toBe('after the save');

    await service.getNote('t1', 'team-a');
    expect(store.getNote('hackmd', 'team-a', 't1')).not.toBeNull();
    await service.listTeamNotes('team-a');
    expect(store.getNote('hackmd', 'team-a', 't1')).toBeNull();

    routes['GET /notes'] = [];
    await service.listNotes();
    expect(store.getNote('hackmd', 'personal', 'n1')).toBeNull();
  });

  it('drops one account\'s notes when another signs in, and everything when turned off', async () => {
    const store = openNoteStore(':memory:');
    const routes: Routes = { 'GET /me': { id: 'user-1' }, 'GET /notes/n1': note('n1', 'private text') };
    const api = fakeHackmd(routes);
    const { service, cache } = restart(store, api.fetcher);
    await service.getCurrentUser();
    await service.getNote('n1');
    routes['GET /me'] = { id: 'user-2' };
    await service.getCurrentUser();
    expect(store.status().hackmdNotes).toBe(0);
    expect(store.getMeta('account_id')).toBe('user-2');

    await service.getNote('n1');
    cache.setEnabled(false);
    expect(store.status().hackmdNotes).toBe(0);
    await service.getNote('n1');
    expect(store.status().hackmdNotes).toBe(0);
  });
});
