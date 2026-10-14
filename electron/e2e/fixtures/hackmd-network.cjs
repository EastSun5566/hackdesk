// Bootstrap the real main process with synthetic HTTP responses and token storage.
// No IPC handlers are replaced: retries, cancellation and preload run normally.
const { safeStorage } = require('electron');
safeStorage.isEncryptionAvailable = () => true;
safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
safeStorage.encryptString = (value) => Buffer.from(value);
safeStorage.decryptString = (value) => value.toString();

const note = { id: 'note-a', title: 'Alpha', content: 'Alpha body', tags: [], readPermission: 'owner', writePermission: 'owner' };
const notes = [note, { ...note, id: 'note-b', title: 'Beta', content: 'Beta body' }];
const fixture = { reads: 0, uploads: 0, aborted: 0, writes: 0, note };
globalThis.hackmdNetworkFixture = fixture;
globalThis.fetch = async (url, init = {}) => {
  const path = new URL(url).pathname;
  const method = init.method ?? 'GET';
  const json = (value) => Response.json(value);
  if (path === '/v1/me') return json({ id: 'fixture-user', name: 'Fixture', userPath: 'fixture', teams: [] });
  if (path === '/v1/teams' || path === '/v1/folders' || path === '/v1/history') return json([]);
  if (path === '/v1/folders/folder-order') return json({});
  if (path === '/v1/notes' && method === 'GET') {
    fixture.reads += 1;
    return fixture.reads === 1 ? new Response('', { status: 503 }) : json(notes);
  }
  if (path === '/v1/notes/note-a' && method === 'GET') {
    const etag = `"fixture-${fixture.writes}"`;
    return new Headers(init.headers).get('If-None-Match') === etag
      ? new Response(null, { status: 304, headers: { ETag: etag } })
      : Response.json(note, { headers: { ETag: etag } });
  }
  if (path === '/v1/notes/note-a' && method === 'PATCH') {
    fixture.writes += 1;
    Object.assign(note, JSON.parse(init.body));
    return json(note);
  }
  if (path === '/v1/notes/note-b' && method === 'GET') return json(notes[1]);
  if (/^\/v1\/notes\/note-[ab]\/images$/.test(path) && method === 'POST') {
    fixture.uploads += 1;
    return new Promise((_resolve, reject) => {
      const abort = () => { fixture.aborted += 1; reject(init.signal.reason); };
      if (init.signal.aborted) abort();
      else init.signal.addEventListener('abort', abort, { once: true });
    });
  }
  throw new Error(`Unexpected fixture request: ${method} ${path}`);
};

require('../../dist/main.cjs');
