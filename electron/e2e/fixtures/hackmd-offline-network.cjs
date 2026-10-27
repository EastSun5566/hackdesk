// Boots the real main process against a synthetic HackMD that answers normally, or fails every
// request like a dropped connection when HACKDESK_FIXTURE_OFFLINE=1.
const { safeStorage } = require('electron');
safeStorage.isEncryptionAvailable = () => true;
safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
safeStorage.encryptString = (value) => Buffer.from(value);
safeStorage.decryptString = (value) => value.toString();

const base = { tags: [], readPermission: 'owner', writePermission: 'owner', lastChangedAt: 1_700_000_000_000 };
const notes = [
  { ...base, id: 'note-a', title: 'Alpha', content: 'Alpha body mentions the quarterly roadmap.' },
  { ...base, id: 'note-b', title: 'Beta', content: 'Beta body is never opened.' },
];
const offline = process.env.HACKDESK_FIXTURE_OFFLINE === '1';
globalThis.fetch = async (url, init = {}) => {
  if (offline) throw new TypeError('fetch failed');
  const path = new URL(url).pathname;
  const method = init.method ?? 'GET';
  const json = (value, headers) => Response.json(value, { headers });
  if (path === '/v1/me') return json({ id: 'fixture-user', name: 'Fixture', userPath: 'fixture', teams: [] });
  if (path === '/v1/teams' || path === '/v1/folders' || path === '/v1/history') return json([]);
  if (path === '/v1/folders/folder-order') return json({});
  if (path === '/v1/notes' && method === 'GET') return json(notes.map(({ content: _content, ...summary }) => summary));
  const note = notes.find(item => path === `/v1/notes/${item.id}`);
  if (note && method === 'GET') return json(note, { ETag: `"${note.id}-1"` });
  throw new Error(`Unexpected fixture request: ${method} ${path}`);
};

require('../../dist/main.cjs');
