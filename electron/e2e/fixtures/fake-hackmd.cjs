// Starts the real main process against an in-memory HackMD API.
// Only `fetch` (the network) and `safeStorage` (the OS keyring) are replaced; every IPC handler,
// validation, the HackMD service, its caches and the preload run unchanged.
//
// State lives in <home>/fake-hackmd.json, so it survives restarts and a spec can seed it before
// launch. Every request is appended to <home>/fake-hackmd-requests.jsonl.
const { safeStorage } = require('electron');
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

// A reversible stand-in for the OS keyring whose ciphertext never contains the plaintext.
const FAKE_CIPHER_PREFIX = 'fake-keyring:';
safeStorage.isEncryptionAvailable = () => true;
safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
safeStorage.encryptString = (value) => Buffer.from(FAKE_CIPHER_PREFIX + [...value].reverse().join(''));
safeStorage.decryptString = (buffer) => {
  const text = buffer.toString();
  if (!text.startsWith(FAKE_CIPHER_PREFIX)) throw new Error('Not encrypted by the fake keyring.');
  return [...text.slice(FAKE_CIPHER_PREFIX.length)].reverse().join('');
};

const homeArgument = process.argv.find(argument => argument.startsWith('--hackdesk-home='));
if (!homeArgument) throw new Error('fake-hackmd.cjs needs --hackdesk-home=<dir>.');
const home = homeArgument.slice('--hackdesk-home='.length);
const statePath = join(home, 'fake-hackmd.json');
const requestLogPath = join(home, 'fake-hackmd-requests.jsonl');

function defaultState() {
  return {
    token: 'fake-hackmd-token',
    user: { id: 'fake-user', name: 'Fake User', userPath: 'fake-user', email: null, photo: null, upgraded: false },
    nextId: 1,
    notes: [
      { id: 'note-alpha', title: 'Alpha', content: '# Alpha\n\nAlpha body', tags: [], revision: 1 },
    ],
    trash: [],
  };
}

const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : defaultState();

// A spec can make writes fail or wait while the app runs, through <home>/fake-hackmd-faults.json:
// { "failPatch": ["note-id"], "delayPatchMs": { "note-id": 2000 } }. It is read on every write.
const faultsPath = join(home, 'fake-hackmd-faults.json');
function readFaults() {
  try {
    return JSON.parse(readFileSync(faultsPath, 'utf8'));
  } catch {
    return {};
  }
}
const persist = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
persist();

function toDto(note) {
  const updatedAt = 1_700_000_000_000 + note.revision * 1000;
  return {
    id: note.id,
    shortId: note.id,
    title: note.title,
    description: '',
    tags: note.tags,
    content: note.content,
    createdAt: 1_700_000_000_000,
    lastChangedAt: updatedAt,
    titleUpdatedAt: updatedAt,
    tagsUpdatedAt: updatedAt,
    publishType: 'edit',
    publishedAt: null,
    permalink: null,
    publishLink: `https://hackmd.io/${note.id}`,
    lastChangeUser: null,
    userPath: state.user.userPath,
    teamPath: null,
    readPermission: 'owner',
    writePermission: 'owner',
    folderPaths: [],
  };
}

const etagOf = note => `W/"${note.id}-${note.revision}"`;
const json = (value, init = {}) => Response.json(value, init);
const error = (status, message) => json({ error: message }, { status });
// Mirrors the HackMD title rule: the first heading names the note when no title is given.
const titleFrom = (content, fallback) => /^#\s+(.+)$/m.exec(content ?? '')?.[1]?.trim() || fallback;

function readBody(init) {
  if (typeof init.body !== 'string') return null;
  try {
    return JSON.parse(init.body);
  } catch {
    return init.body;
  }
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  const body = readBody(init);
  appendFileSync(requestLogPath, `${JSON.stringify({
    method,
    path: url.pathname,
    search: url.search,
    authorization: headers.get('Authorization'),
    ifNoneMatch: headers.get('If-None-Match'),
    body,
  })}\n`);

  if (url.origin !== 'https://api.hackmd.io') return error(404, `Unexpected host ${url.origin}`);
  if (headers.get('Authorization') !== `Bearer ${state.token}`) return error(401, 'Invalid token');

  const path = url.pathname.replace(/^\/v1/, '');
  const noteMatch = /^\/notes\/([^/]+)$/.exec(path);
  const note = noteMatch ? state.notes.find(item => item.id === decodeURIComponent(noteMatch[1])) : undefined;

  if (method === 'GET' && path === '/me') return json({ ...state.user, teams: [] });
  if (method === 'GET' && (path === '/teams' || path === '/folders' || path === '/history' || path === '/trash')) return json([]);
  if (method === 'GET' && path === '/folders/folder-order') return json({});
  if (method === 'GET' && path === '/notes') return json(state.notes.map(toDto));

  if (method === 'POST' && path === '/notes') {
    const created = {
      id: `note-${state.nextId++}`,
      title: body?.title || titleFrom(body?.content, 'Untitled'),
      content: body?.content ?? '',
      tags: body?.tags ?? [],
      revision: 1,
    };
    state.notes.push(created);
    persist();
    return json(toDto(created), { status: 201 });
  }

  if (noteMatch && !note) return error(404, 'Note not found');

  if (method === 'GET' && note) {
    const etag = etagOf(note);
    return headers.get('If-None-Match') === etag
      ? new Response(null, { status: 304, headers: { ETag: etag } })
      : json(toDto(note), { headers: { ETag: etag } });
  }

  if (method === 'PATCH' && note) {
    const faults = readFaults();
    const delay = faults.delayPatchMs?.[note.id];
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    if (faults.failPatch?.includes(note.id)) return error(500, 'Simulated HackMD failure');
    if (typeof body?.content === 'string') note.content = body.content;
    if (typeof body?.title === 'string') note.title = body.title;
    if (Array.isArray(body?.tags)) note.tags = body.tags;
    note.revision += 1;
    persist();
    // Like HackMD, accept the update without returning the note.
    return new Response(null, { status: 202 });
  }

  if (method === 'DELETE' && note) {
    state.notes = state.notes.filter(item => item !== note);
    state.trash.push(note);
    persist();
    return new Response(null, { status: 204 });
  }

  const restoreMatch = /^\/trash\/([^/]+)\/restore$/.exec(path);
  if (method === 'PUT' && restoreMatch) {
    const trashed = state.trash.find(item => item.id === decodeURIComponent(restoreMatch[1]));
    if (!trashed) return error(404, 'Note not found in trash');
    state.trash = state.trash.filter(item => item !== trashed);
    state.notes.push(trashed);
    persist();
    return new Response(null, { status: 204 });
  }

  return error(404, `The fake HackMD does not implement ${method} ${path}`);
};

require('../../dist/main.cjs');
