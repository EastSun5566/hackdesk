import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { NoteSummary } from '../../../../src/lib/electron-api';
import { extractNoteLinks, hackmdNoteKeys, hackmdRefKey, type HackmdNoteRef } from '../../../../src/lib/note-links';
import { searchNoteIndex, type NoteSearchInput, type NoteSearchResult } from './note-search';

/** Bump to rebuild every cache on upgrade; the store holds nothing that cannot be fetched again. */
const SCHEMA_VERSION = '2';
/** Opened HackMD notes kept for offline reading; the oldest go first. */
export const MAX_CACHED_HACKMD_NOTES = 2_000;

export type NoteSource = 'hackmd' | 'local';

export type StoredNote = {
  source: NoteSource;
  /** `personal`, a team path, or a vault ID. */
  workspace: string;
  noteId: string;
  title: string;
  content: string;
  /** What decides whether the copy is current: a HackMD ETag or a vault file's content hash. */
  revision: string | null;
  /** Everything else needed to show the note again, as JSON; for a vault note, `{ relativePath }`. */
  meta: string | null;
};

export type LinkingNote = { source: NoteSource; workspace: string; noteId: string; title: string; meta: string | null };

/** A HackMD note found from a link, from an opened copy or a cached workspace list. */
export type ResolvedHackmdNote = { noteId: string; teamPath: string | null; title: string; shortId: string; snippet: string | null };

const SCHEMA = `
  create table if not exists meta (key text primary key, value text not null);
  create table if not exists notes (
    source text not null,
    workspace text not null,
    note_id text not null,
    title text not null,
    content text not null,
    revision text,
    meta text,
    cached_at integer not null,
    primary key (source, workspace, note_id)
  );
  create virtual table if not exists notes_fts using fts5(
    title, content, content = 'notes', tokenize = 'trigram'
  );
  create trigger if not exists notes_ai after insert on notes begin
    insert into notes_fts (rowid, title, content) values (new.rowid, new.title, new.content);
  end;
  create trigger if not exists notes_ad after delete on notes begin
    insert into notes_fts (notes_fts, rowid, title, content) values ('delete', old.rowid, old.title, old.content);
    delete from links where source = old.source and workspace = old.workspace and note_id = old.note_id;
  end;
  create trigger if not exists notes_au after update on notes begin
    insert into notes_fts (notes_fts, rowid, title, content) values ('delete', old.rowid, old.title, old.content);
    insert into notes_fts (rowid, title, content) values (new.rowid, new.title, new.content);
  end;
  create table if not exists responses (key text primary key, json text not null, cached_at integer not null);
  create table if not exists links (
    source text not null,
    workspace text not null,
    note_id text not null,
    target text not null,
    primary key (source, workspace, note_id, target)
  );
  create index if not exists links_target on links (target);
`;

function openDatabase(path: string) {
  if (path !== ':memory:') {
    // Notes can be private; only this account may read the cache.
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    chmodSync(dirname(path), 0o700);
  }
  const db = new DatabaseSync(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec('pragma journal_mode = wal; pragma synchronous = normal;');
  return db;
}

function resetIfOutdated(db: DatabaseSync, log: (message: string) => void) {
  const hasMeta = db.prepare("select 1 from sqlite_master where type = 'table' and name = 'meta'").get();
  const version = hasMeta
    ? (db.prepare("select value from meta where key = 'schema_version'").get() as { value: string } | undefined)?.value
    : undefined;
  if (version === SCHEMA_VERSION) return;
  if (version !== undefined || hasMeta) log(`Rebuilding the note cache (schema ${version ?? 'unknown'} → ${SCHEMA_VERSION}).`);
  db.exec(`
    drop trigger if exists notes_ai; drop trigger if exists notes_ad; drop trigger if exists notes_au;
    drop table if exists notes_fts; drop table if exists notes; drop table if exists responses; drop table if exists meta;
    drop table if exists links;
  `);
  db.exec(SCHEMA);
  db.prepare("insert into meta (key, value) values ('schema_version', ?)").run(SCHEMA_VERSION);
}

/**
 * The local copy of notes: opened HackMD notes and every Local Vault note, with a full-text index,
 * plus the HackMD list responses that let the workbench open offline.
 */
export function openNoteStore(path: string, { log = () => undefined }: { log?: (message: string) => void } = {}) {
  const db = openDatabase(path);
  resetIfOutdated(db, log);

  const upsert = db.prepare(`
    insert into notes (source, workspace, note_id, title, content, revision, meta, cached_at)
    values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict (source, workspace, note_id) do update set
      title = excluded.title, content = excluded.content, revision = excluded.revision,
      meta = excluded.meta, cached_at = excluded.cached_at
  `);
  const evictOldest = db.prepare(`
    delete from notes where rowid in (
      select rowid from notes where source = 'hackmd' order by cached_at desc limit -1 offset ?
    )
  `);

  function transaction(work: () => void) {
    db.exec('begin');
    try {
      work();
      db.exec('commit');
    } catch (error) {
      db.exec('rollback');
      throw error;
    }
  }

  function revisions(source: NoteSource, workspace: string) {
    const rows = db.prepare('select note_id, revision from notes where source = ? and workspace = ?')
      .all(source, workspace) as { note_id: string; revision: string | null }[];
    return new Map(rows.map(row => [row.note_id, row.revision]));
  }

  const clearLinks = db.prepare('delete from links where source = ? and workspace = ? and note_id = ?');
  const addLink = db.prepare('insert or ignore into links (source, workspace, note_id, target) values (?, ?, ?, ?)');

  function vaultPath(note: StoredNote) {
    if (note.source !== 'local' || !note.meta) return null;
    const { relativePath } = JSON.parse(note.meta) as { relativePath?: unknown };
    return typeof relativePath === 'string' ? relativePath : null;
  }

  function put(note: StoredNote, now: number) {
    upsert.run(note.source, note.workspace, note.noteId, note.title, note.content, note.revision, note.meta, now);
    clearLinks.run(note.source, note.workspace, note.noteId);
    for (const target of extractNoteLinks(note.content, vaultPath(note))) addLink.run(note.source, note.workspace, note.noteId, target);
  }

  /** Every HackMD note this cache knows: opened copies first, then the workspace lists shown. */
  function* knownHackmdNotes(): Generator<{ note: NoteSummary; snippet: string | null }> {
    const opened = db.prepare("select content, meta from notes where source = 'hackmd' and meta is not null")
      .all() as { content: string; meta: string }[];
    for (const row of opened) yield { note: JSON.parse(row.meta) as NoteSummary, snippet: row.content.slice(0, 160) };
    const lists = db.prepare("select json from responses where key = 'notes' or key like 'team:%:notes' or key like 'history:%'")
      .all() as { json: string }[];
    for (const row of lists) {
      for (const note of JSON.parse(row.json) as NoteSummary[]) yield { note, snippet: null };
    }
  }

  return {
    putNote(note: StoredNote) {
      transaction(() => {
        put(note, Date.now());
        if (note.source === 'hackmd') evictOldest.run(MAX_CACHED_HACKMD_NOTES);
      });
    },

    /** Writes many notes in one transaction, for indexing a vault. */
    putNotes(notes: StoredNote[]) {
      const now = Date.now();
      transaction(() => notes.forEach(note => put(note, now)));
    },

    getNote(source: NoteSource, workspace: string, noteId: string): StoredNote | null {
      const row = db.prepare(`
        select title, content, revision, meta from notes where source = ? and workspace = ? and note_id = ?
      `).get(source, workspace, noteId) as { title: string; content: string; revision: string | null; meta: string | null } | undefined;
      return row ? { source, workspace, noteId, ...row } : null;
    },

    /** Note ID → revision for one workspace, to find what changed. */
    revisions,

    noteKeys(source: NoteSource) {
      return db.prepare('select workspace, note_id as noteId from notes where source = ?').all(source) as { workspace: string; noteId: string }[];
    },

    deleteNote(source: NoteSource, workspace: string, noteId: string) {
      db.prepare('delete from notes where source = ? and workspace = ? and note_id = ?').run(source, workspace, noteId);
    },

    /** Drops the workspace's notes that are not in `keep`: deleted, moved away, or no longer shared. */
    retainNotes(source: NoteSource, workspace: string, keep: Iterable<string>) {
      const kept = new Set(keep);
      const gone = [...revisions(source, workspace).keys()].filter(noteId => !kept.has(noteId));
      if (!gone.length) return;
      const remove = db.prepare('delete from notes where source = ? and workspace = ? and note_id = ?');
      transaction(() => gone.forEach(noteId => remove.run(source, workspace, noteId)));
    },

    clearWorkspace(source: NoteSource, workspace: string) {
      db.prepare('delete from notes where source = ? and workspace = ?').run(source, workspace);
    },

    /** Keeps only one workspace of `source`, or none: an inactive vault's index is not kept around. */
    keepOnlyWorkspace(source: NoteSource, workspace: string | null) {
      db.prepare('delete from notes where source = ? and workspace is not ?').run(source, workspace);
    },

    /** Forgets everything from HackMD: its notes, list responses and account. */
    clearHackmd() {
      transaction(() => {
        db.exec("delete from notes where source = 'hackmd'; delete from responses; delete from meta where key = 'account_id';");
      });
    },

    putResponse(key: string, value: unknown) {
      db.prepare(`
        insert into responses (key, json, cached_at) values (?, ?, ?)
        on conflict (key) do update set json = excluded.json, cached_at = excluded.cached_at
      `).run(key, JSON.stringify(value), Date.now());
    },

    getResponse<T>(key: string): T | undefined {
      const row = db.prepare('select json from responses where key = ?').get(key) as { json: string } | undefined;
      return row ? JSON.parse(row.json) as T : undefined;
    },

    deleteResponses(matches: (key: string) => boolean) {
      const keys = (db.prepare('select key from responses').all() as { key: string }[]).map(row => row.key).filter(matches);
      if (!keys.length) return;
      const remove = db.prepare('delete from responses where key = ?');
      transaction(() => keys.forEach(key => remove.run(key)));
    },

    getMeta(key: string) {
      return (db.prepare('select value from meta where key = ?').get(key) as { value: string } | undefined)?.value ?? null;
    },

    setMeta(key: string, value: string) {
      db.prepare('insert into meta (key, value) values (?, ?) on conflict (key) do update set value = excluded.value').run(key, value);
    },

    search(input: NoteSearchInput): NoteSearchResult {
      return searchNoteIndex(db, input);
    },

    /** Notes whose text links to any of `keys`, across vaults and HackMD workspaces. */
    backlinks(keys: string[], limit = 100): LinkingNote[] {
      if (!keys.length) return [];
      return db.prepare(`
        select distinct notes.source as source, notes.workspace as workspace, notes.note_id as noteId, notes.title as title, notes.meta as meta
        from links join notes on notes.source = links.source and notes.workspace = links.workspace and notes.note_id = links.note_id
        where links.target in (${keys.map(() => '?').join(', ')})
        order by notes.title limit ?
      `).all(...keys, limit) as LinkingNote[];
    },

    findLocalNoteByPath(vaultId: string, relativePath: string) {
      const row = db.prepare(`
        select note_id as noteId, title, substr(content, 1, 160) as snippet from notes
        where source = 'local' and workspace = ? and json_extract(meta, '$.relativePath') = ?
      `).get(vaultId, relativePath) as { noteId: string; title: string; snippet: string } | undefined;
      return row ?? null;
    },

    findHackmdNote(ref: HackmdNoteRef): ResolvedHackmdNote | null {
      const key = hackmdRefKey(ref);
      for (const { note, snippet } of knownHackmdNotes()) {
        if (!hackmdNoteKeys(note).includes(key)) continue;
        return { noteId: note.id, teamPath: note.teamPath, title: note.title, shortId: note.shortId, snippet };
      }
      return null;
    },

    status() {
      const count = (source: NoteSource) => (db.prepare('select count(*) as count from notes where source = ?').get(source) as { count: number }).count;
      const bytes = (db.prepare(`
        select coalesce(sum(length(cast(content as blob))), 0) + coalesce((select sum(length(cast(json as blob))) from responses), 0) as bytes
        from notes where source = 'hackmd'
      `).get() as { bytes: number }).bytes;
      return { hackmdNotes: count('hackmd'), hackmdBytes: bytes, localNotes: count('local') };
    },

    close() {
      db.close();
    },
  };
}

export type NoteStore = ReturnType<typeof openNoteStore>;
