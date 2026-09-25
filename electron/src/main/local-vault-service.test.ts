import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => ({
  homePath: '',
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => electronMock.homePath),
  },
}));

import { getSettingsPath } from './paths';
import {
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

  it('preserves descendant note ids when a folder is renamed', async () => {
    await mkdir(join(vaultPath, 'Projects', 'Nested'), { recursive: true });
    const { document: note } = await createLocalNote({ title: 'Stable', parentPath: 'Projects/Nested', content: 'Body' });

    const snapshot = await renameLocalFolder({ relativePath: 'Projects', name: 'Renamed' });

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
