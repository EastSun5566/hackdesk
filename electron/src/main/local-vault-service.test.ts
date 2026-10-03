import { link, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  homePath: '',
}));
const fsProbe = vi.hoisted(() => ({ afterRead: vi.fn<(path: string) => Promise<void>>() }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  const read = vi.fn(async (...args: Parameters<typeof fs.readFile>) => {
    const result = await fs.readFile(...args);
    await fsProbe.afterRead(String(args[0]));
    return result;
  });
  return { ...fs, readFile: read, default: { ...fs, readFile: read } };
});

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.homePath),
  },
}));

import { getSettingsPath } from './paths';
import {
  createLocalFolder,
  createLocalNote,
  importLocalVaultAttachment,
  readLocalNote,
  revealLocalVaultFolder,
  revealLocalVaultNote,
  revealLocalVaultRoot,
  renameLocalFolder,
  renameLocalNote,
  scanLocalVault,
  trashLocalNote,
  watchLocalVault,
  writeLocalNote,
} from './local-vault-service';

describe('LocalVaultService', () => {
  let homePath = '';
  let vaultPath = '';

  beforeEach(async () => {
    fsProbe.afterRead.mockReset();
    homePath = await mkdtemp(join(tmpdir(), 'hackdesk-local-home-'));
    vaultPath = await mkdtemp(join(tmpdir(), 'hackdesk-local-vault-'));
    electronMock.homePath = homePath;
    await mkdir(join(homePath, '.hackdesk'), { recursive: true });
    await writeFile(getSettingsPath(), JSON.stringify({
      title: 'HackDesk',
      hackmdApiToken: '',
      localVault: { path: vaultPath },
    }));
  });

  afterEach(async () => {
    await rm(homePath, { force: true, recursive: true });
    await rm(vaultPath, { force: true, recursive: true });
  });

  it('scans markdown notes, ignores hidden metadata, and rebuilds a manifest', async () => {
    await mkdir(join(vaultPath, 'Projects'), { recursive: true });
    await mkdir(join(vaultPath, '.hackdesk'), { recursive: true });
    await writeFile(join(vaultPath, 'Projects', 'Plan.md'), '# Plan');
    await writeFile(join(vaultPath, '.hackdesk', 'Ignored.md'), 'internal');

    const snapshot = await scanLocalVault(vaultPath);
    const manifest = await readFile(join(vaultPath, '.hackdesk', 'manifest.json'), 'utf8');

    expect(snapshot.notes).toHaveLength(1);
    expect(snapshot.notes[0]).toMatchObject({
      title: 'Plan',
      relativePath: 'Projects/Plan.md',
      parentPath: 'Projects',
    });
    expect(snapshot.folders.map((folder) => folder.relativePath)).toEqual(['Projects']);
    expect(manifest).toContain(snapshot.notes[0].id);
  });

  it('creates notes with collision-safe names and preserves stable IDs after reads', async () => {
    const { document: first } = await createLocalNote({ title: 'Untitled', content: 'one' });
    const { document: second } = await createLocalNote({ title: 'Untitled', content: 'two' });
    const reread = await readLocalNote(first.id);

    expect(first.relativePath).toBe('Untitled.md');
    expect(second.relativePath).toBe('Untitled 2.md');
    expect(reread.id).toBe(first.id);
    expect(reread.content).toBe('one');
  });

  it('preserves IDs for external rename, move and folder rename across scans and reads', async () => {
    const { document } = await createLocalNote({ title: 'Original', content: 'Body' });
    await rename(join(vaultPath, 'Original.md'), join(vaultPath, 'Renamed.md'));
    expect((await scanLocalVault(vaultPath)).notes).toContainEqual(expect.objectContaining({ id: document.id, relativePath: 'Renamed.md' }));
    await mkdir(join(vaultPath, 'Folder'));
    await rename(join(vaultPath, 'Renamed.md'), join(vaultPath, 'Folder', 'Renamed.md'));
    expect((await scanLocalVault(vaultPath)).notes[0].id).toBe(document.id);
    await rename(join(vaultPath, 'Folder'), join(vaultPath, 'Moved'));
    expect((await scanLocalVault(vaultPath)).notes[0]).toMatchObject({ id: document.id, relativePath: 'Moved/Renamed.md' });
    expect(await readLocalNote(document.id)).toMatchObject({ id: document.id, relativePath: 'Moved/Renamed.md', content: 'Body' });
  });

  it('rescans stale manifest paths inside read and write operations before watcher delivery', async () => {
    const { document } = await createLocalNote({ title: 'Original', content: 'Body' });
    await rename(join(vaultPath, 'Original.md'), join(vaultPath, 'Renamed.md'));
    expect(await readLocalNote(document.id)).toMatchObject({ id: document.id, title: 'Renamed' });
    await rename(join(vaultPath, 'Renamed.md'), join(vaultPath, 'Moved.md'));
    const saved = await writeLocalNote({ noteId: document.id, content: 'Draft', expectedRevision: document.revision });
    expect(saved.document).toMatchObject({ id: document.id, relativePath: 'Moved.md', content: 'Draft' });
  });

  it.each(['Body', 'Replacement'])('keeps a moved note ID when its old path is recreated with %s', async (replacement) => {
    const { document } = await createLocalNote({ title: 'Original', content: 'Body' });
    await rename(join(vaultPath, 'Original.md'), join(vaultPath, 'Renamed.md'));
    await writeFile(join(vaultPath, 'Original.md'), replacement);
    const snapshot = await scanLocalVault(vaultPath);
    expect(snapshot.notes.find((note) => note.relativePath === 'Renamed.md')?.id).toBe(document.id);
    expect(snapshot.notes.find((note) => note.relativePath === 'Original.md')?.id).not.toBe(document.id);
    await writeLocalNote({ noteId: document.id, content: 'Draft', expectedRevision: document.revision });
    expect(await readFile(join(vaultPath, 'Renamed.md'), 'utf8')).toBe('Draft');
    expect(await readFile(join(vaultPath, 'Original.md'), 'utf8')).toBe(replacement);
  });

  it('does not confuse identical-content notes, copies, or delete-and-create operations', async () => {
    const { document: a } = await createLocalNote({ title: 'A', content: 'Same' });
    const { document: b } = await createLocalNote({ title: 'B', content: 'Same' });
    await rename(join(vaultPath, 'A.md'), join(vaultPath, 'Renamed.md'));
    await writeFile(join(vaultPath, 'Copy.md'), 'Same');
    const moved = await scanLocalVault(vaultPath);
    expect(moved.notes.find((note) => note.relativePath === 'Renamed.md')?.id).toBe(a.id);
    expect(moved.notes.find((note) => note.relativePath === 'B.md')?.id).toBe(b.id);
    expect(moved.notes.find((note) => note.relativePath === 'Copy.md')?.id).not.toBe(a.id);
    await rm(join(vaultPath, 'Renamed.md'));
    await writeFile(join(vaultPath, 'Replacement.md'), 'Same');
    expect((await scanLocalVault(vaultPath)).notes.find((note) => note.relativePath === 'Replacement.md')?.id).not.toBe(a.id);
  });

  it('never matches hard links or a rename with changed content', async () => {
    const { document } = await createLocalNote({ title: 'Original', content: 'Body' });
    await link(join(vaultPath, 'Original.md'), join(vaultPath, 'Link.md'));
    await scanLocalVault(vaultPath);
    await rename(join(vaultPath, 'Original.md'), join(vaultPath, 'Renamed.md'));
    const snapshot = await scanLocalVault(vaultPath);
    expect(snapshot.notes.find((note) => note.relativePath === 'Renamed.md')?.id).not.toBe(document.id);
    const { document: edited } = await createLocalNote({ title: 'Edited', content: 'Before' });
    await rename(join(vaultPath, 'Edited.md'), join(vaultPath, 'Changed.md'));
    await writeFile(join(vaultPath, 'Changed.md'), 'After');
    expect((await scanLocalVault(vaultPath)).notes.find((note) => note.relativePath === 'Changed.md')?.id).not.toBe(edited.id);
  });

  it('keeps same-path IDs through normal edits and atomic replacement, then uses the refreshed identity for moves', async () => {
    const { document } = await createLocalNote({ title: 'Original', content: 'Body' });
    await writeFile(join(vaultPath, 'Original.md'), 'Edited');
    expect((await scanLocalVault(vaultPath)).notes[0].id).toBe(document.id);
    await writeFile(join(vaultPath, 'replacement.tmp'), 'Atomic');
    await rename(join(vaultPath, 'replacement.tmp'), join(vaultPath, 'Original.md'));
    expect((await scanLocalVault(vaultPath)).notes[0].id).toBe(document.id);
    await rename(join(vaultPath, 'Original.md'), join(vaultPath, 'Moved.md'));
    expect((await scanLocalVault(vaultPath)).notes[0].id).toBe(document.id);
  });

  it.each([undefined, { dev: '0', ino: '0', birthtimeNs: '1' }, { dev: 1, ino: '2', birthtimeNs: '3' }])(
    'does not guess missing or invalid file identities, but fills them on a successful same-path scan: %j', async (identity) => {
      const { document } = await createLocalNote({ title: 'Original', content: 'Body' });
      const path = join(vaultPath, '.hackdesk', 'manifest.json');
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      manifest.notes['Original.md'].fileIdentity = identity;
      await writeFile(path, JSON.stringify(manifest));
      await rename(join(vaultPath, 'Original.md'), join(vaultPath, 'Moved.md'));
      const moved = (await scanLocalVault(vaultPath)).notes[0];
      expect(moved.id).not.toBe(document.id);
      expect(JSON.parse(await readFile(path, 'utf8')).notes['Moved.md'].fileIdentity).toMatchObject({ ino: expect.any(String), birthtimeNs: expect.any(String) });
      await rename(join(vaultPath, 'Moved.md'), join(vaultPath, 'Again.md'));
      expect((await scanLocalVault(vaultPath)).notes[0].id).toBe(moved.id);
    },
  );

  it('upgrades legacy manifest entries without changing IDs', async () => {
    const { document } = await createLocalNote({ title: 'Original', content: 'Body' });
    const path = join(vaultPath, '.hackdesk', 'manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    delete manifest.notes['Original.md'].fileIdentity;
    await writeFile(path, JSON.stringify(manifest));
    expect((await scanLocalVault(vaultPath)).notes[0].id).toBe(document.id);
    await rename(join(vaultPath, 'Original.md'), join(vaultPath, 'Moved.md'));
    expect((await scanLocalVault(vaultPath)).notes[0].id).toBe(document.id);
  });

  it('retries an unstable scan once and never writes a partial manifest', async () => {
    const { document } = await createLocalNote({ title: 'Original', content: 'Body' });
    const path = join(vaultPath, '.hackdesk', 'manifest.json');
    const before = await readFile(path, 'utf8');
    let reads = 0;
    fsProbe.afterRead.mockImplementation(async (path) => {
      if (path.endsWith('Original.md')) await writeFile(path, `External ${++reads}`);
    });
    await expect(scanLocalVault(vaultPath)).rejects.toThrow('changed during scanning');
    expect(reads).toBe(2);
    expect(await readFile(path, 'utf8')).toBe(before);
    fsProbe.afterRead.mockReset();
    expect((await scanLocalVault(vaultPath)).notes[0].id).toBe(document.id);
  });

  it('rejects stale writes when the file changed on disk', async () => {
    const { document: note } = await createLocalNote({ title: 'Draft', content: 'base' });
    await writeFile(join(vaultPath, note.relativePath), 'external');

    await expect(writeLocalNote({
      noteId: note.id,
      content: 'mine',
      expectedRevision: note.revision,
    })).rejects.toThrow('File changed on disk');
  });

  it('writes atomically when the expected revision matches', async () => {
    const { document: note } = await createLocalNote({ title: 'Draft', content: 'base' });
    const { document: updated } = await writeLocalNote({
      noteId: note.id,
      content: 'next',
      expectedRevision: note.revision,
    });

    expect(updated.content).toBe('next');
    await expect(readFile(join(vaultPath, note.relativePath), 'utf8')).resolves.toBe('next');
  });

  it('saves a changed title and content in one operation', async () => {
    const { document: note } = await createLocalNote({ title: 'Draft', content: 'base' });
    const { document: updated } = await writeLocalNote({
      noteId: note.id,
      title: 'Renamed',
      content: 'next',
      expectedRevision: note.revision,
    });

    expect(updated).toMatchObject({
      id: note.id,
      title: 'Renamed',
      relativePath: 'Renamed.md',
      content: 'next',
    });
    await expect(readFile(join(vaultPath, 'Draft.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(join(vaultPath, 'Renamed.md'), 'utf8')).resolves.toBe('next');
  });

  it('does not rename a note when its content cannot be written', async () => {
    const { document: note } = await createLocalNote({ title: 'Draft', content: 'base' });

    await expect(writeLocalNote({
      noteId: note.id,
      title: 'Renamed',
      content: 'x'.repeat(10 * 1024 * 1024 + 1),
      expectedRevision: note.revision,
    })).rejects.toThrow('cannot exceed 10 MiB');

    await expect(readFile(join(vaultPath, 'Draft.md'), 'utf8')).resolves.toBe('base');
    await expect(readFile(join(vaultPath, 'Renamed.md'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('moves deleted notes to the provided trash implementation', async () => {
    const { document: note } = await createLocalNote({ title: 'Delete me', content: 'bye' });
    const trashItem = vi.fn(async (path: string) => {
      await rm(path, { force: true });
    });

    const snapshot = await trashLocalNote({ noteId: note.id }, trashItem);
    const canonicalVaultPath = await realpath(vaultPath);

    expect(trashItem).toHaveBeenCalledWith(join(canonicalVaultPath, note.relativePath));
    expect(snapshot.notes).toHaveLength(0);
  });

  it('reveals only paths inside the active local vault', async () => {
    await mkdir(join(vaultPath, 'Projects'), { recursive: true });
    const { document: note } = await createLocalNote({ title: 'Reveal me', parentPath: 'Projects', content: 'hello' });
    const openPath = vi.fn(async () => '');
    const showItemInFolder = vi.fn();

    await revealLocalVaultRoot(openPath);
    await revealLocalVaultNote({ noteId: note.id }, showItemInFolder);
    await revealLocalVaultFolder({ relativePath: 'Projects' }, showItemInFolder);
    const canonicalVaultPath = await realpath(vaultPath);

    expect(openPath).toHaveBeenCalledWith(canonicalVaultPath);
    expect(showItemInFolder).toHaveBeenCalledWith(join(canonicalVaultPath, note.relativePath));
    expect(showItemInFolder).toHaveBeenCalledWith(join(canonicalVaultPath, 'Projects'));
    await expect(revealLocalVaultFolder({ relativePath: '../outside' }, showItemInFolder)).rejects.toThrow('outside the local vault');
  });

  it('imports attachments beside the note and returns an encoded relative link', async () => {
    await mkdir(join(vaultPath, 'Projects'), { recursive: true });
    const { document: note } = await createLocalNote({ title: 'With image', parentPath: 'Projects', content: 'hello' });

    const { attachment: first } = await importLocalVaultAttachment({
      noteId: note.id,
      fileName: 'My Diagram.png',
      mimeType: 'image/png',
      bytes: new TextEncoder().encode('image-one').buffer,
    });
    const { attachment: second } = await importLocalVaultAttachment({
      noteId: note.id,
      fileName: 'My Diagram.png',
      mimeType: 'image/png',
      bytes: new TextEncoder().encode('image-two').buffer,
    });

    expect(first).toEqual({
      link: 'attachments/My%20Diagram.png',
      relativePath: 'Projects/attachments/My Diagram.png',
    });
    expect(second).toEqual({
      link: 'attachments/My%20Diagram%202.png',
      relativePath: 'Projects/attachments/My Diagram 2.png',
    });
    await expect(readFile(join(vaultPath, first.relativePath), 'utf8')).resolves.toBe('image-one');
    await expect(readFile(join(vaultPath, second.relativePath), 'utf8')).resolves.toBe('image-two');
  });

  it('fails explicitly when the manifest is corrupt', async () => {
    await mkdir(join(vaultPath, '.hackdesk'), { recursive: true });
    await writeFile(join(vaultPath, '.hackdesk', 'manifest.json'), '{broken', 'utf8');

    await expect(scanLocalVault(vaultPath)).rejects.toThrow();
  });

  it('returns the created folder identity when another parent has the same folder name', async () => {
    await mkdir(join(vaultPath, 'Archive', 'Design-Specs'), { recursive: true });
    await mkdir(join(vaultPath, 'Projects'), { recursive: true });

    const { folder, snapshot } = await createLocalFolder({
      parentPath: 'Projects',
      name: 'Design/Specs',
    });

    expect(folder).toMatchObject({
      id: 'local-folder:Projects/Design-Specs',
      name: 'Design-Specs',
      relativePath: 'Projects/Design-Specs',
      parentPath: 'Projects',
    });
    expect(snapshot.folders.filter((candidate) => candidate.name === 'Design-Specs')).toHaveLength(2);
  });

  it('rejects ignored folder names before changing the filesystem', async () => {
    await expect(createLocalFolder({ name: ' node_modules ' })).rejects.toThrow('reserved by the local vault');
    await expect(realpath(join(vaultPath, 'node_modules'))).rejects.toMatchObject({ code: 'ENOENT' });

    await mkdir(join(vaultPath, 'Projects'));
    await expect(renameLocalFolder({ relativePath: 'Projects', name: '.git' })).rejects.toThrow('reserved by the local vault');
    await expect(realpath(join(vaultPath, 'Projects'))).resolves.toEqual(expect.any(String));
    await expect(realpath(join(vaultPath, '.git'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves descendant note ids when a folder is renamed', async () => {
    await mkdir(join(vaultPath, 'Projects', 'Nested'), { recursive: true });
    await mkdir(join(vaultPath, 'Archive', 'Renamed'), { recursive: true });
    const { document: note } = await createLocalNote({ title: 'Stable', parentPath: 'Projects/Nested', content: 'Body' });

    const { folder, snapshot } = await renameLocalFolder({ relativePath: 'Projects', name: 'Renamed' });

    expect(folder).toMatchObject({ id: 'local-folder:Renamed', relativePath: 'Renamed' });
    expect(snapshot.notes).toContainEqual(expect.objectContaining({
      id: note.id,
      relativePath: 'Renamed/Nested/Stable.md',
    }));
  });

  it('serializes scans and manifest mutations for the same vault', async () => {
    const { document: original } = await createLocalNote({ title: 'Original', content: 'Body' });

    const [, renamed, created] = await Promise.all([
      scanLocalVault(vaultPath),
      renameLocalNote({
        noteId: original.id,
        title: 'Renamed',
        expectedRevision: original.revision,
      }),
      createLocalNote({ title: 'Second', content: 'Other' }),
    ]);
    const finalSnapshot = await scanLocalVault(vaultPath);

    expect(renamed.document.id).toBe(original.id);
    expect(finalSnapshot.notes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: original.id, relativePath: 'Renamed.md' }),
      expect.objectContaining({ id: created.document.id, relativePath: 'Second.md' }),
    ]));
  });

  it('continues queued vault operations after an earlier operation fails', async () => {
    const { document: note } = await createLocalNote({ title: 'Draft', content: 'base' });
    await writeFile(join(vaultPath, note.relativePath), 'external');

    const [failedWrite, created] = await Promise.allSettled([
      writeLocalNote({
        noteId: note.id,
        content: 'mine',
        expectedRevision: note.revision,
      }),
      createLocalNote({ title: 'After failure', content: 'saved' }),
    ]);

    expect(failedWrite.status).toBe('rejected');
    expect(created.status).toBe('fulfilled');
    const finalSnapshot = await scanLocalVault(vaultPath);
    expect(finalSnapshot.notes).toContainEqual(expect.objectContaining({
      title: 'After failure',
    }));
  });

  it('refreshes once after filesystem events arrive while the watcher is paused', async () => {
    let notify: ((eventType: string, filename: string | Buffer | null) => void) | undefined;
    let resolveChange!: (snapshot: Awaited<ReturnType<typeof scanLocalVault>>) => void;
    const changed = new Promise<Awaited<ReturnType<typeof scanLocalVault>>>((resolve) => {
      resolveChange = resolve;
    });
    const close = vi.fn();
    const watcher = watchLocalVault(
      vaultPath,
      resolveChange,
      (_path, _options, listener) => {
        notify = listener;
        return { close, on: vi.fn() } as never;
      },
    );

    watcher.pause();
    await writeFile(join(vaultPath, 'External.md'), '# External');
    notify?.('change', 'External.md');
    watcher.resume();

    await expect(changed).resolves.toMatchObject({
      notes: [expect.objectContaining({ title: 'External' })],
    });
    watcher.close();
  });

  it('rejects mutations through a symlink inside the vault', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'hackdesk-outside-'));
    try {
      await symlink(outside, join(vaultPath, 'escape'));
      await expect(createLocalNote({ title: 'Escape', parentPath: 'escape', content: 'Body' }))
        .rejects.toThrow('symbolic links');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('does not recreate a missing configured vault path', async () => {
    await rm(vaultPath, { force: true, recursive: true });

    await expect(scanLocalVault(vaultPath)).rejects.toThrow();
    await expect(createLocalNote({ title: 'Nope' })).rejects.toThrow();
  });
});
