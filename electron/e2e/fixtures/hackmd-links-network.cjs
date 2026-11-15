// Boots the real main process against a synthetic HackMD whose notes embed and link each other.
// `@fixture/gamma` is not in the note list, so opening it needs one lookup by reference.
const { safeStorage, shell } = require('electron');
safeStorage.isEncryptionAvailable = () => true;
safeStorage.getSelectedStorageBackend = () => 'gnome_libsecret';
safeStorage.encryptString = (value) => Buffer.from(value);
safeStorage.decryptString = (value) => value.toString();

const fixture = { lookups: [], external: [] };
globalThis.linksFixture = fixture;
shell.openExternal = async (url) => { fixture.external.push(url); };

const base = { tags: [], readPermission: 'owner', writePermission: 'owner', userPath: 'fixture', teamPath: null, publishType: 'edit', lastChangedAt: 1_700_000_000_000 };
const alpha = {
  ...base, id: 'note-a', shortId: 'alpha-short', permalink: null, title: 'Alpha',
  content: '# Alpha\n\n{%hackmd @fixture/beta %}\n\nSee [Gamma](https://hackmd.io/@fixture/gamma) and [Site](https://example.com/page).\n',
};
const beta = { ...base, id: 'note-b', shortId: 'beta-short', permalink: 'beta', title: 'Beta', content: '# Beta\n\nBeta body text.\n' };
const gamma = { ...base, id: 'note-c', shortId: 'gamma-short', permalink: 'gamma', title: 'Gamma', content: '# Gamma\n\nGamma body text.\n' };
const listed = [alpha, beta];

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
    const note = [alpha, beta, gamma].find(item => item.id === ref);
    if (note) return json(note, { ETag: `"${note.id}-1"` });
    fixture.lookups.push(ref);
    if (ref.endsWith('@fixture/gamma')) return json(gamma);
    return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
  }
  throw new Error(`Unexpected fixture request: ${method} ${path}`);
};

require('../../dist/main.cjs');
