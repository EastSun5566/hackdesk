import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  scanLocalVault,
  trashLocalNote,
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
    const first = await createLocalNote({ title: 'Untitled', content: 'one' });
    const second = await createLocalNote({ title: 'Untitled', content: 'two' });
    const reread = await readLocalNote(first.id);

    expect(first.relativePath).toBe('Untitled.md');
    expect(second.relativePath).toBe('Untitled 2.md');
    expect(reread.id).toBe(first.id);
    expect(reread.content).toBe('one');
  });

  it('rejects stale writes when the file changed on disk', async () => {
    const note = await createLocalNote({ title: 'Draft', content: 'base' });
    await writeFile(join(vaultPath, note.relativePath), 'external');

    await expect(writeLocalNote({
      noteId: note.id,
      content: 'mine',
      expectedRevision: note.revision,
    })).rejects.toThrow('File changed on disk');
  });

  it('writes atomically when the expected revision matches', async () => {
    const note = await createLocalNote({ title: 'Draft', content: 'base' });
    const updated = await writeLocalNote({
      noteId: note.id,
      content: 'next',
      expectedRevision: note.revision,
    });

    expect(updated.content).toBe('next');
    await expect(readFile(join(vaultPath, note.relativePath), 'utf8')).resolves.toBe('next');
  });

  it('moves deleted notes to the provided trash implementation', async () => {
    const note = await createLocalNote({ title: 'Delete me', content: 'bye' });
    const trashItem = vi.fn(async (path: string) => {
      await rm(path, { force: true });
    });

    const snapshot = await trashLocalNote({ noteId: note.id }, trashItem);

    expect(trashItem).toHaveBeenCalledWith(join(vaultPath, note.relativePath));
    expect(snapshot.notes).toHaveLength(0);
  });

  it('reveals only paths inside the active local vault', async () => {
    await mkdir(join(vaultPath, 'Projects'), { recursive: true });
    const note = await createLocalNote({ title: 'Reveal me', parentPath: 'Projects', content: 'hello' });
    const openPath = vi.fn(async () => '');
    const showItemInFolder = vi.fn();

    await revealLocalVaultRoot(openPath);
    await revealLocalVaultNote({ noteId: note.id }, showItemInFolder);
    await revealLocalVaultFolder({ relativePath: 'Projects' }, showItemInFolder);

    expect(openPath).toHaveBeenCalledWith(vaultPath);
    expect(showItemInFolder).toHaveBeenCalledWith(join(vaultPath, note.relativePath));
    expect(showItemInFolder).toHaveBeenCalledWith(join(vaultPath, 'Projects'));
    await expect(revealLocalVaultFolder({ relativePath: '../outside' }, showItemInFolder)).rejects.toThrow('outside the local vault');
  });

  it('imports attachments beside the note and returns an encoded relative link', async () => {
    await mkdir(join(vaultPath, 'Projects'), { recursive: true });
    const note = await createLocalNote({ title: 'With image', parentPath: 'Projects', content: 'hello' });

    const first = await importLocalVaultAttachment({
      noteId: note.id,
      fileName: 'My Diagram.png',
      mimeType: 'image/png',
      bytes: new TextEncoder().encode('image-one').buffer,
    });
    const second = await importLocalVaultAttachment({
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

  it('does not recreate a missing configured vault path', async () => {
    await rm(vaultPath, { force: true, recursive: true });

    await expect(scanLocalVault(vaultPath)).rejects.toThrow();
    await expect(createLocalNote({ title: 'Nope' })).rejects.toThrow();
  });
});
