// Boots the real main process against a synthetic HackMD without a Templates folder. Creating
// folders and notes is recorded so the test can check where a saved template went.
const { safeStorage } = require('electron');
safeStorage.isEncryptionAvailable = () => true;
safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
safeStorage.encryptString = (value) => Buffer.from(value);
safeStorage.decryptString = (value) => value.toString();

const fixture = { createdFolders: [], createdNotes: [] };
globalThis.templatesFixture = fixture;

const base = { tags: [], readPermission: 'owner', writePermission: 'owner', userPath: 'fixture', teamPath: null, publishType: 'edit', permalink: null, lastChangedAt: 1_700_000_000_000 };
const folders = [];
const notes = [{ ...base, id: 'note-standup', shortId: 'standup', title: 'Standup', content: '# Standup\n\n## Yesterday\n\n## Today\n', folderPaths: [] }];

globalThis.fetch = async (url, init = {}) => {
  const path = new URL(url).pathname;
  const method = init.method ?? 'GET';
  const json = (value, headers) => Response.json(value, { headers });
  const body = init.body ? JSON.parse(init.body) : {};
  if (path === '/v1/me') return json({ id: 'fixture-user', name: 'Fixture', userPath: 'fixture', teams: [] });
  if (path === '/v1/teams' || path === '/v1/history') return json([]);
  if (path === '/v1/folders/folder-order') return json({});
  if (path === '/v1/folders' && method === 'GET') return json(folders);
  if (path === '/v1/folders' && method === 'POST') {
    const folder = { id: `folder-${folders.length + 1}`, name: body.name, parentId: null, icon: null, color: null, clientId: null };
    folders.push(folder);
    fixture.createdFolders.push(body.name);
    return json(folder);
  }
  if (path === '/v1/notes' && method === 'GET') return json(notes.map(({ content: _content, ...summary }) => summary));
  if (path === '/v1/notes' && method === 'POST') {
    const folder = folders.find(item => item.id === body.parentFolderId);
    const note = { ...base, id: `note-${notes.length + 1}`, shortId: `short-${notes.length + 1}`, title: body.title, content: body.content, folderPaths: folder ? [folder] : [] };
    notes.push(note);
    fixture.createdNotes.push({ title: body.title, parentFolderId: body.parentFolderId ?? null });
    return json(note);
  }
  const note = notes.find(item => path === `/v1/notes/${item.id}`);
  if (note && method === 'GET') return json(note, { ETag: `"${note.id}-1"` });
  throw new Error(`Unexpected fixture request: ${method} ${path}`);
};

require('../../dist/main.cjs');
