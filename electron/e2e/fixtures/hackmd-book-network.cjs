// Boots the real main process against a synthetic HackMD with a book note and its chapters.
// The Guide chapter is not in the note list, so opening it needs one lookup by reference.
const { safeStorage, shell } = require('electron');
safeStorage.isEncryptionAvailable = () => true;
safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
safeStorage.encryptString = (value) => Buffer.from(value);
safeStorage.decryptString = (value) => value.toString();

const fixture = { lookups: [], external: [] };
globalThis.bookFixture = fixture;
shell.openExternal = async (url) => { fixture.external.push(url); };

const base = { tags: [], readPermission: 'owner', writePermission: 'owner', userPath: 'fixture', teamPath: null, publishType: 'edit', lastChangedAt: 1_700_000_000_000 };
const book = {
  ...base, id: 'note-book', shortId: 'book-short', permalink: 'handbook', title: 'Handbook', publishType: 'book',
  content: [
    '# Handbook',
    '- [Setup](https://hackmd.io/@fixture/setup)',
    '- [Tools](/tools-short)',
    '- [Guide](https://hackmd.io/@fixture/guide)',
    '- [Docs](https://example.com/docs) [target=_blank]',
    '',
  ].join('\n'),
};
const setup = { ...base, id: 'note-setup', shortId: 'setup-short', permalink: 'setup', title: 'Setup', content: '# Setup\n\nSetup body text.\n' };
const tools = { ...base, id: 'note-tools', shortId: 'tools-short', permalink: null, title: 'Tools', content: '# Tools\n\nTools body text.\n' };
const guide = { ...base, id: 'note-guide', shortId: 'guide-short', permalink: 'guide', title: 'Guide', content: '# Guide\n\nGuide body text.\n' };
const listed = [book, setup, tools];

globalThis.fetch = async (url, init = {}) => {
  const path = new URL(url).pathname;
  const method = init.method ?? 'GET';
  const json = (value, headers) => Response.json(value, { headers });
  if (path === '/v1/me') return json({ id: 'fixture-user', name: 'Fixture', userPath: 'fixture', teams: [] });
  if (path === '/v1/teams' || path === '/v1/folders' || path === '/v1/history') return json([]);
  if (path === '/v1/folders/folder-order') return json({});
  if (path === '/v1/notes' && method === 'GET') return json(listed.map(({ content: _content, ...summary }) => summary));
  if (path.startsWith('/v1/notes/') && method === 'GET') {
    const ref = decodeURIComponent(path.slice('/v1/notes/'.length));
    const note = [book, setup, tools, guide].find(item => item.id === ref);
    if (note) return json(note, { ETag: `"${note.id}-1"` });
    fixture.lookups.push(ref);
    if (ref.endsWith('@fixture/guide')) return json(guide);
    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
  }
  throw new Error(`Unexpected fixture request: ${method} ${path}`);
};

require('../../dist/main.cjs');
