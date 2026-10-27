/**
 * How a link names a HackMD note: by short ID (or note ID), or by `@owner/permalink`.
 * Parsing matches how hackmd.io treats note URLs.
 */
export type HackmdNoteRef =
  | { kind: 'short'; id: string }
  | { kind: 'named'; owner: string; slug: string };

export type EmbedLine =
  | { kind: 'embed'; ref: HackmdNoteRef | null; raw: string }
  | { kind: 'preview'; url: string };

const HACKMD_HOSTS = new Set(['hackmd.io', 'www.hackmd.io']);
/** First path segments that are HackMD pages, not notes. */
const RESERVED_PATHS = new Set([
  'about', 'api', 'blog', 'dashboard', 'explore', 'features', 'join', 'legal', 'login', 'logout', 'me', 'new',
  'pricing', 'privacy', 'profile', 'recent', 'search', 'settings', 'signup', 'tags', 'team', 'teams', 'terms',
]);
/** Short-link prefixes, as in `hackmd.io/s/<id>`. */
const SHORT_LINK_PREFIXES = new Set(['s', 'c', 'p']);

function decode(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

const withoutMd = (value: string) => value.replace(/\.md$/i, '');

/** Reads a note from a hackmd.io path: `/@owner/permalink`, `/s/<id>`, or `/<id>` with an optional action such as `/edit`. */
export function parseHackmdNotePath(pathname: string): HackmdNoteRef | null {
  const [first, second] = pathname.split('/').filter(Boolean).map(decode);
  if (!first) return null;
  if (first.startsWith('@')) {
    return first.length > 1 && second ? { kind: 'named', owner: first.slice(1), slug: withoutMd(second) } : null;
  }
  if (SHORT_LINK_PREFIXES.has(first) && second) return { kind: 'short', id: withoutMd(second) };
  return RESERVED_PATHS.has(first.toLowerCase()) ? null : { kind: 'short', id: withoutMd(first) };
}

export function parseHackmdUrl(value: string): HackmdNoteRef | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !HACKMD_HOSTS.has(url.hostname.toLowerCase())) return null;
  return parseHackmdNotePath(url.pathname);
}

/**
 * Tidies what a `{%hackmd … %}` line names into `@owner/permalink` or a short ID. People paste
 * paths and URLs here too, so the query, hash and leading `./`, `../` or `https://` are dropped.
 */
function cleanEmbedRef(value: string) {
  const path = value.split(/[?#]/)[0]!.replace(/^[a-z][a-z0-9+.-]*:\/*/i, '');
  const at = path.indexOf('@');
  return at >= 0 ? path.slice(at) : path.replace(/^(?:\.{0,2}\/)+/, '');
}

/** The note a `{%hackmd … %}` reference names; null for a path HackDesk cannot match to a note. */
export function parseEmbedRef(ref: string): HackmdNoteRef | null {
  const cleaned = cleanEmbedRef(ref.trim());
  if (!cleaned) return null;
  if (cleaned.startsWith('@')) return parseHackmdNotePath(`/${cleaned}`);
  return cleaned.includes('/') ? null : { kind: 'short', id: withoutMd(decode(cleaned)) };
}

/** A whole line that is a HackMD note embed, `{%hackmd ref %}`, or a link preview, `{%preview url %}`. */
export function parseEmbedLine(line: string): EmbedLine | null {
  const tag = /^\{%(hackmd|preview)\s+(\S+)\s*%\}$/.exec(line.trim());
  if (!tag) return null;
  const value = tag[2]!;
  if (tag[1] === 'hackmd') return { kind: 'embed', ref: parseEmbedRef(value), raw: cleanEmbedRef(value) };
  // A preview needs a full web address.
  return /^https?:\/\//i.test(value) ? { kind: 'preview', url: value } : null;
}

export function hackmdRefKey(ref: HackmdNoteRef) {
  return ref.kind === 'short' ? `hackmd:short:${ref.id}` : `hackmd:named:${ref.owner.toLowerCase()}/${ref.slug}`;
}

/** Every key a link to this HackMD note could use. */
export function hackmdNoteKeys(note: {
  id: string;
  shortId: string;
  permalink: string | null;
  userPath: string | null;
  teamPath: string | null;
}) {
  const keys = new Set([hackmdRefKey({ kind: 'short', id: note.shortId }), hackmdRefKey({ kind: 'short', id: note.id })]);
  const owner = note.teamPath || note.userPath;
  if (owner) {
    keys.add(hackmdRefKey({ kind: 'named', owner, slug: note.permalink || note.shortId }));
    keys.add(hackmdRefKey({ kind: 'named', owner, slug: note.shortId }));
  }
  return [...keys];
}

/**
 * The vault path a relative link from `fromPath` points to, or null when it is not a Markdown
 * file inside the vault (a web address, an anchor, or a path climbing above the vault root).
 */
export function resolveLocalLink(fromPath: string, target: string) {
  const value = target.trim();
  if (!value || value.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  const path = decode(value.split(/[?#]/)[0]!);
  if (!/\.(?:md|markdown)$/i.test(path)) return null;
  // A leading slash means the vault root; otherwise the path is relative to the linking note's folder.
  const base = path.startsWith('/') ? [] : fromPath.split('/').slice(0, -1);
  return normalizeVaultPath([...base, ...path.split('/')]) || null;
}

export const localLinkKey = (path: string) => `local:${path}`;

/** Joins and normalizes vault paths; null when the path climbs above the vault root. */
function normalizeVaultPath(segments: string[]) {
  const parts: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.join('/');
}

/** Code can show link syntax without linking anything. */
function stripCode(markdown: string) {
  return markdown
    .replace(/^(\s*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '');
}

/**
 * The notes a Markdown text links to, as index keys: HackMD links, embeds and previews, plus
 * relative vault links when `fromPath` (the note's own vault path) is known.
 */
export function extractNoteLinks(markdown: string, fromPath: string | null) {
  const text = stripCode(markdown);
  const keys = new Set<string>();
  const add = (target: string) => {
    const ref = parseHackmdUrl(target);
    if (ref) {
      keys.add(hackmdRefKey(ref));
      return;
    }
    const local = fromPath === null ? null : resolveLocalLink(fromPath, target);
    if (local) keys.add(localLinkKey(local));
  };
  for (const match of text.matchAll(/(?<!!)\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'(][^)]*)?\)/g)) add(match[1]!);
  for (const match of text.matchAll(/<(https?:\/\/[^>\s]+)>/g)) add(match[1]!);
  for (const match of text.matchAll(/https?:\/\/(?:www\.)?hackmd\.io\/[^\s)<>\]"'`]+/gi)) add(match[0]);
  for (const line of text.split('\n')) {
    const embed = parseEmbedLine(line);
    if (embed?.kind === 'embed' && embed.ref) keys.add(hackmdRefKey(embed.ref));
    if (embed?.kind === 'preview') add(embed.url);
  }
  return [...keys];
}

/** A Markdown link target from one vault note to another, with each path segment URL-encoded. */
export function relativeVaultLink(fromPath: string, toPath: string) {
  const from = fromPath.split('/').slice(0, -1);
  const to = toPath.split('/');
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared += 1;
  const up = from.slice(shared).map(() => '..');
  const path = [...up, ...to.slice(shared)].map(segment => (segment === '..' ? segment : encodeURIComponent(segment))).join('/');
  return up.length ? path : `./${path}`;
}

/** How `{%hackmd %}` names a note: `@owner/permalink` when it has one, otherwise its short ID. */
export function hackmdEmbedRef(note: { shortId: string; permalink: string | null; userPath: string | null; teamPath: string | null }) {
  const owner = note.teamPath || note.userPath;
  return owner && note.permalink ? `@${owner}/${note.permalink}` : note.shortId;
}
