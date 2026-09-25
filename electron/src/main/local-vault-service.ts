import { createHash, randomUUID } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

import type {
  LocalDocument,
  LocalFolder,
  LocalVaultAttachmentMutationResult,
  LocalVaultDocumentMutationResult,
  LocalVaultImportAttachmentInput,
  LocalNoteSummary,
  LocalRevision,
  LocalVaultCreateFolderInput,
  LocalVaultCreateNoteInput,
  LocalVaultMoveFolderInput,
  LocalVaultMoveNoteInput,
  LocalVaultRenameFolderInput,
  LocalVaultRenameNoteInput,
  LocalVaultRevealFolderInput,
  LocalVaultRevealNoteInput,
  LocalVaultSnapshot,
  LocalVaultTrashFolderInput,
  LocalVaultTrashNoteInput,
  LocalVaultWriteInput,
} from '../../../src/lib/local-vault';
import { readStoredSettings } from './settings';
import { writeLog } from './logging';

type TrashItem = (path: string) => Promise<void>;
type OpenPath = (path: string) => Promise<string>;
type ShowItemInFolder = (path: string) => void;
type WatchFileSystem = (
  path: string,
  options: { recursive: boolean },
  listener: (eventType: string, filename: string | Buffer | null) => void,
) => FSWatcher;

type VaultManifest = {
  version: 1;
  vaultId: string;
  notes: Record<string, { id: string; contentHash?: string }>;
};

type ScanEntry = {
  absolutePath: string;
  relativePath: string;
};

const MANIFEST_DIR = '.hackdesk';
const MANIFEST_FILE = 'manifest.json';
const IGNORED_DIRS = new Set([MANIFEST_DIR, '.git', 'node_modules']);
const MARKDOWN_EXTENSION = '.md';
const ATTACHMENTS_DIR = 'attachments';
const MAX_MARKDOWN_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const defaultManifest = (): VaultManifest => ({
  version: 1,
  vaultId: randomUUID(),
  notes: {},
});

const vaultOperationQueues = new Map<string, Promise<unknown>>();

function enqueueVaultOperation<T>(vaultRoot: string, task: () => Promise<T>): Promise<T> {
  const previous = vaultOperationQueues.get(vaultRoot) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(task)
    .finally(() => {
      if (vaultOperationQueues.get(vaultRoot) === next) {
        vaultOperationQueues.delete(vaultRoot);
      }
    });
  vaultOperationQueues.set(vaultRoot, next);
  return next;
}

function hashContent(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

function toVaultRelativePath(vaultRoot: string, absolutePath: string) {
  return relative(vaultRoot, absolutePath).split(sep).join('/');
}

function normalizeRelativePath(input?: string | null) {
  if (!input) {
    return null;
  }

  const normalized = input.replaceAll('\\', '/').replace(/^\/+/, '');
  if (
    normalized === '..'
    || normalized.includes('/../')
    || normalized.startsWith('../')
    || normalized.includes('\0')
  ) {
    throw new Error('Path is outside the local vault.');
  }

  return normalized.replace(/\/+$/, '') || null;
}

function resolveInsideVault(vaultRoot: string, relativePath?: string | null) {
  const normalized = normalizeRelativePath(relativePath);
  const target = normalized ? resolve(vaultRoot, normalized) : vaultRoot;
  const root = resolve(vaultRoot);

  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error('Path is outside the local vault.');
  }

  return target;
}

function sanitizeFileName(input: string) {
  const trimmed = input.trim() || 'Untitled';
  const cleaned = [...trimmed]
    .map((character) => ('<>:"/\\|?*'.includes(character) || character.charCodeAt(0) < 32 ? '-' : character))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Untitled';
}

function splitFileName(fileName: string) {
  const sanitized = sanitizeFileName(basename(fileName));
  const extension = extname(sanitized);
  const stem = extension ? sanitized.slice(0, -extension.length) : sanitized;
  return {
    extension,
    stem: stem || 'attachment',
  };
}

function encodeMarkdownLinkPath(relativePath: string) {
  return relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function getTitleFromRelativePath(relativePath: string) {
  return basename(relativePath, MARKDOWN_EXTENSION);
}

function getManifestPath(vaultRoot: string) {
  return join(vaultRoot, MANIFEST_DIR, MANIFEST_FILE);
}

async function readManifest(vaultRoot: string): Promise<VaultManifest> {
  try {
    const content = await readFile(getManifestPath(vaultRoot), 'utf8');
    const parsed = JSON.parse(content) as Partial<VaultManifest>;
    if (parsed.version !== 1 || typeof parsed.vaultId !== 'string' || typeof parsed.notes !== 'object' || !parsed.notes) {
      throw new Error('Local vault manifest is invalid. Repair or remove .hackdesk/manifest.json explicitly.');
    }

    return {
      version: 1,
      vaultId: parsed.vaultId,
      notes: Object.fromEntries(
        Object.entries(parsed.notes).filter(([, entry]) => (
          entry
          && typeof entry === 'object'
          && typeof entry.id === 'string'
          && entry.id.length > 0
        )),
      ) as VaultManifest['notes'],
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return defaultManifest();
    }
    throw error;
  }
}

async function writeManifest(vaultRoot: string, manifest: VaultManifest) {
  await mkdir(join(vaultRoot, MANIFEST_DIR), { recursive: true });
  const path = getManifestPath(vaultRoot);
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  try {
    if (await readFile(path, 'utf8') === content) {
      return;
    }
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }
  await atomicWriteFile(path, content);
}

async function scanMarkdownFiles(vaultRoot: string, current = vaultRoot): Promise<ScanEntry[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const scanned: ScanEntry[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const absolutePath = join(current, entry.name);
    const itemStat = await lstat(absolutePath);
    if (itemStat.isSymbolicLink()) {
      continue;
    }

    if (itemStat.isDirectory()) {
      scanned.push(...await scanMarkdownFiles(vaultRoot, absolutePath));
      continue;
    }

    if (itemStat.isFile() && extname(entry.name).toLowerCase() === MARKDOWN_EXTENSION) {
      scanned.push({
        absolutePath,
        relativePath: toVaultRelativePath(vaultRoot, absolutePath),
      });
    }
  }

  return scanned;
}

async function scanFolders(vaultRoot: string, current = vaultRoot): Promise<LocalFolder[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const folders: LocalFolder[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const absolutePath = join(current, entry.name);
    const itemStat = await lstat(absolutePath);
    if (itemStat.isSymbolicLink()) {
      continue;
    }

    const relativePath = toVaultRelativePath(vaultRoot, absolutePath);
    folders.push({
      id: `local-folder:${relativePath}`,
      name: entry.name,
      relativePath,
      parentPath: dirname(relativePath) === '.' ? null : dirname(relativePath).split(sep).join('/'),
      createdAtMillis: itemStat.birthtimeMs,
      updatedAtMillis: itemStat.mtimeMs,
    });
    folders.push(...await scanFolders(vaultRoot, absolutePath));
  }

  return folders.sort((left, right) => left.relativePath.localeCompare(right.relativePath, undefined, { sensitivity: 'base' }));
}

async function createNoteSummary(
  manifest: VaultManifest,
  entry: ScanEntry,
  content: string,
): Promise<LocalNoteSummary> {
  const fileStat = await stat(entry.absolutePath);
  const contentHash = hashContent(content);
  const manifestEntry = manifest.notes[entry.relativePath] ?? { id: randomUUID() };
  manifest.notes[entry.relativePath] = {
    id: manifestEntry.id,
    contentHash,
  };

  return {
    id: manifestEntry.id,
    title: getTitleFromRelativePath(entry.relativePath),
    relativePath: entry.relativePath,
    parentPath: dirname(entry.relativePath) === '.' ? null : dirname(entry.relativePath).split(sep).join('/'),
    createdAtMillis: fileStat.birthtimeMs,
    updatedAtMillis: fileStat.mtimeMs,
    revision: {
      contentHash,
      mtimeMs: fileStat.mtimeMs,
    },
  };
}

export async function getActiveLocalVaultPath() {
  const settings = await readStoredSettings();
  return settings.localVault.path?.trim() || null;
}

async function assertVaultRootExists(vaultRoot: string) {
  const itemStat = await lstat(vaultRoot);
  if (itemStat.isSymbolicLink()) {
    throw new Error('Local vault root cannot be a symbolic link.');
  }
  if (!itemStat.isDirectory()) {
    throw new Error('Configured local vault is not a folder.');
  }
}

async function assertCanonicalInsideVault(vaultRoot: string, targetPath: string) {
  const canonicalRoot = await realpath(vaultRoot);
  let existingPath = targetPath;
  while (true) {
    try {
      const item = await lstat(existingPath);
      if (item.isSymbolicLink()) {
        throw new Error('Local vault paths cannot traverse symbolic links.');
      }
      break;
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
        throw error;
      }
      const parent = dirname(existingPath);
      if (parent === existingPath) throw error;
      existingPath = parent;
    }
  }
  const canonicalParent = await realpath(existingPath);
  if (canonicalParent !== canonicalRoot && !canonicalParent.startsWith(`${canonicalRoot}${sep}`)) {
    throw new Error('Path is outside the canonical local vault.');
  }
  const relativeExisting = relative(canonicalRoot, canonicalParent);
  let cursor = canonicalRoot;
  for (const segment of relativeExisting.split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    if ((await lstat(cursor)).isSymbolicLink()) {
      throw new Error('Local vault paths cannot traverse symbolic links.');
    }
  }
}

async function requireActiveLocalVaultPath() {
  const vaultPath = await getActiveLocalVaultPath();
  if (!vaultPath) {
    throw new Error('No local vault is configured.');
  }

  await assertVaultRootExists(vaultPath);
  return realpath(vaultPath);
}

async function scanLocalVaultUnlocked(vaultRoot: string): Promise<LocalVaultSnapshot> {
  const manifest = await readManifest(vaultRoot);
  const files = await scanMarkdownFiles(vaultRoot);
  const livePaths = new Set(files.map((file) => file.relativePath));

  for (const relativePath of Object.keys(manifest.notes)) {
    if (!livePaths.has(relativePath)) {
      delete manifest.notes[relativePath];
    }
  }

  const notes = await Promise.all(files.map(async (entry) => {
    if ((await stat(entry.absolutePath)).size > MAX_MARKDOWN_BYTES) {
      throw new Error(`Markdown file exceeds 10 MiB: ${entry.relativePath}`);
    }
    return createNoteSummary(manifest, entry, await readFile(entry.absolutePath, 'utf8'));
  }));
  const folders = await scanFolders(vaultRoot);

  await writeManifest(vaultRoot, manifest);

  return {
    vaultId: manifest.vaultId,
    rootPath: vaultRoot,
    scannedAtMillis: Date.now(),
    notes: notes.sort((left, right) => (
      (right.updatedAtMillis ?? 0) - (left.updatedAtMillis ?? 0)
      || left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
    )),
    folders,
  };
}

export async function scanLocalVault(vaultRoot: string): Promise<LocalVaultSnapshot> {
  const configuredRoot = resolve(vaultRoot);
  await assertVaultRootExists(configuredRoot);
  const resolvedRoot = await realpath(configuredRoot);
  return enqueueVaultOperation(resolvedRoot, () => scanLocalVaultUnlocked(resolvedRoot));
}

export async function revealLocalVaultRoot(openPath: OpenPath) {
  const vaultRoot = await requireActiveLocalVaultPath();
  const error = await openPath(vaultRoot);
  if (error) {
    throw new Error(error);
  }
}

export async function revealLocalVaultNote(input: LocalVaultRevealNoteInput, showItemInFolder: ShowItemInFolder) {
  const vaultRoot = await requireActiveLocalVaultPath();
  await enqueueVaultOperation(vaultRoot, async () => {
    const note = await findNoteById(vaultRoot, input.noteId);
    showItemInFolder(resolveInsideVault(vaultRoot, note.relativePath));
  });
}

export async function revealLocalVaultFolder(input: LocalVaultRevealFolderInput, showItemInFolder: ShowItemInFolder) {
  const vaultRoot = await requireActiveLocalVaultPath();
  showItemInFolder(resolveInsideVault(vaultRoot, input.relativePath));
}

export async function getActiveLocalVaultSnapshot() {
  const vaultRoot = await getActiveLocalVaultPath();
  return vaultRoot ? scanLocalVault(vaultRoot) : null;
}

async function findNoteById(vaultRoot: string, noteId: string) {
  const manifest = await readManifest(vaultRoot);
  const match = Object.entries(manifest.notes).find(([, entry]) => entry.id === noteId);
  if (!match) {
    throw new Error('Local note was not found.');
  }
  const [relativePath] = match;
  const absolutePath = resolveInsideVault(vaultRoot, relativePath);
  await assertCanonicalInsideVault(vaultRoot, absolutePath);
  const content = await readFile(absolutePath, 'utf8');
  return createNoteSummary(manifest, { absolutePath, relativePath }, content);
}

async function remapManifestFolder(vaultRoot: string, fromPath: string, toPath: string) {
  const manifest = await readManifest(vaultRoot);
  const nextNotes: VaultManifest['notes'] = {};
  for (const [path, entry] of Object.entries(manifest.notes)) {
    const nextPath = path === fromPath || path.startsWith(`${fromPath}/`)
      ? `${toPath}${path.slice(fromPath.length)}`
      : path;
    nextNotes[nextPath] = entry;
  }
  await writeManifest(vaultRoot, { ...manifest, notes: nextNotes });
}

async function moveManifestNotePath(vaultRoot: string, fromRelativePath: string, toRelativePath: string) {
  const manifest = await readManifest(vaultRoot);
  const entry = manifest.notes[fromRelativePath];
  if (entry) {
    delete manifest.notes[fromRelativePath];
    manifest.notes[toRelativePath] = entry;
    await writeManifest(vaultRoot, manifest);
  }
}

async function readLocalNoteUnlocked(vaultRoot: string, noteId: string): Promise<LocalDocument> {
  const note = await findNoteById(vaultRoot, noteId);
  const content = await readFile(resolveInsideVault(vaultRoot, note.relativePath), 'utf8');
  return { ...note, content };
}

export async function readLocalNote(noteId: string): Promise<LocalDocument> {
  const vaultRoot = await requireActiveLocalVaultPath();
  return enqueueVaultOperation(vaultRoot, () => readLocalNoteUnlocked(vaultRoot, noteId));
}

async function createUniqueMarkdownPath(vaultRoot: string, parentPath: string | null, title: string) {
  const directory = resolveInsideVault(vaultRoot, parentPath);
  await mkdir(directory, { recursive: true });
  const baseName = sanitizeFileName(title).replace(new RegExp(`${MARKDOWN_EXTENSION}$`, 'i'), '');

  for (let index = 1; index < 1000; index += 1) {
    const suffix = index === 1 ? '' : ` ${index}`;
    const absolutePath = join(directory, `${baseName}${suffix}${MARKDOWN_EXTENSION}`);

    try {
      await lstat(absolutePath);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return absolutePath;
      }

      throw error;
    }
  }

  throw new Error('Could not create a unique note file name.');
}

async function createUniqueAttachmentPath(vaultRoot: string, parentPath: string | null, fileName: string) {
  const noteDirectory = resolveInsideVault(vaultRoot, parentPath);
  const attachmentsDirectory = join(noteDirectory, ATTACHMENTS_DIR);
  await mkdir(attachmentsDirectory, { recursive: true });

  const { extension, stem } = splitFileName(fileName);
  for (let index = 1; index < 1000; index += 1) {
    const suffix = index === 1 ? '' : ` ${index}`;
    const absolutePath = join(attachmentsDirectory, `${stem}${suffix}${extension}`);

    try {
      await lstat(absolutePath);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        return absolutePath;
      }

      throw error;
    }
  }

  throw new Error('Could not create a unique attachment file name.');
}

export async function createLocalNote(input: LocalVaultCreateNoteInput): Promise<LocalVaultDocumentMutationResult> {
  const vaultRoot = await requireActiveLocalVaultPath();
  return enqueueVaultOperation(vaultRoot, async () => {
    const parentPath = normalizeRelativePath(input.parentPath);
    const absolutePath = await createUniqueMarkdownPath(vaultRoot, parentPath, input.title ?? 'Untitled');
    await assertCanonicalInsideVault(vaultRoot, absolutePath);
    const content = input.content ?? '';
    if (Buffer.byteLength(content, 'utf8') > MAX_MARKDOWN_BYTES) throw new Error('Markdown files cannot exceed 10 MiB.');
    await writeFile(absolutePath, content, 'utf8');
    const relativePath = toVaultRelativePath(vaultRoot, absolutePath);
    const manifest = await readManifest(vaultRoot);
    const id = randomUUID();
    manifest.notes[relativePath] = { id, contentHash: hashContent(content) };
    await writeManifest(vaultRoot, manifest);
    const document = await readLocalNoteUnlocked(vaultRoot, id);
    const snapshot = await scanLocalVaultUnlocked(vaultRoot);
    return { document, snapshot };
  });
}

export async function importLocalVaultAttachment(
  input: LocalVaultImportAttachmentInput,
): Promise<LocalVaultAttachmentMutationResult> {
  const vaultRoot = await requireActiveLocalVaultPath();
  return enqueueVaultOperation(vaultRoot, async () => {
    if (input.bytes.byteLength > MAX_ATTACHMENT_BYTES) throw new Error('Attachments cannot exceed 25 MiB.');
    const note = await findNoteById(vaultRoot, input.noteId);
    const attachmentPath = await createUniqueAttachmentPath(vaultRoot, note.parentPath, input.fileName);
    await writeFile(attachmentPath, new Uint8Array(input.bytes));

    const relativePath = toVaultRelativePath(vaultRoot, attachmentPath);
    const noteFolderPath = note.parentPath ? `${note.parentPath}/` : '';
    const link = relativePath.startsWith(noteFolderPath)
      ? relativePath.slice(noteFolderPath.length)
      : relativePath;
    const snapshot = await scanLocalVaultUnlocked(vaultRoot);

    return {
      attachment: {
        link: encodeMarkdownLinkPath(link),
        relativePath,
      },
      snapshot,
    };
  });
}

async function atomicWriteFile(filePath: string, content: string) {
  const temporaryPath = join(dirname(filePath), `.${basename(filePath)}.hackdesk-tmp-${randomUUID()}`);
  const handle = await open(temporaryPath, 'w');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.datasync();
  } finally {
    await handle.close();
  }

  await rename(temporaryPath, filePath);
}

function assertRevisionMatches(current: LocalRevision, expected: LocalRevision) {
  if (current.contentHash !== expected.contentHash) {
    throw new Error('File changed on disk. Reload it or save a copy before writing.');
  }
}

export async function writeLocalNote(input: LocalVaultWriteInput): Promise<LocalVaultDocumentMutationResult> {
  if (Buffer.byteLength(input.content, 'utf8') > MAX_MARKDOWN_BYTES) throw new Error('Markdown files cannot exceed 10 MiB.');
  const vaultRoot = await requireActiveLocalVaultPath();
  return enqueueVaultOperation(vaultRoot, async () => {
    const note = await findNoteById(vaultRoot, input.noteId);
    const filePath = resolveInsideVault(vaultRoot, note.relativePath);
    const currentContent = await readFile(filePath, 'utf8');
    assertRevisionMatches({ contentHash: hashContent(currentContent), mtimeMs: (await stat(filePath)).mtimeMs }, input.expectedRevision);
    await atomicWriteFile(filePath, input.content);
    const document = await readLocalNoteUnlocked(vaultRoot, input.noteId);
    const snapshot = await scanLocalVaultUnlocked(vaultRoot);
    return { document, snapshot };
  });
}

export async function renameLocalNote(input: LocalVaultRenameNoteInput): Promise<LocalVaultDocumentMutationResult> {
  const vaultRoot = await requireActiveLocalVaultPath();
  return enqueueVaultOperation(vaultRoot, async () => {
    const note = await findNoteById(vaultRoot, input.noteId);
    if (input.expectedRevision) {
      assertRevisionMatches(note.revision, input.expectedRevision);
    }

    const source = resolveInsideVault(vaultRoot, note.relativePath);
    const target = await createUniqueMarkdownPath(vaultRoot, note.parentPath, input.title);
    await rename(source, target);
    await moveManifestNotePath(vaultRoot, note.relativePath, toVaultRelativePath(vaultRoot, target));
    const document = await readLocalNoteUnlocked(vaultRoot, input.noteId);
    const snapshot = await scanLocalVaultUnlocked(vaultRoot);
    return { document, snapshot };
  });
}

export async function moveLocalNote(input: LocalVaultMoveNoteInput): Promise<LocalVaultDocumentMutationResult> {
  const vaultRoot = await requireActiveLocalVaultPath();
  return enqueueVaultOperation(vaultRoot, async () => {
    const note = await findNoteById(vaultRoot, input.noteId);
    if (input.expectedRevision) {
      assertRevisionMatches(note.revision, input.expectedRevision);
    }

    const source = resolveInsideVault(vaultRoot, note.relativePath);
    const targetDirectory = resolveInsideVault(vaultRoot, input.parentPath);
    await mkdir(targetDirectory, { recursive: true });
    const target = await createUniqueMarkdownPath(vaultRoot, normalizeRelativePath(input.parentPath), note.title);
    await rename(source, target);
    await moveManifestNotePath(vaultRoot, note.relativePath, toVaultRelativePath(vaultRoot, target));
    const document = await readLocalNoteUnlocked(vaultRoot, input.noteId);
    const snapshot = await scanLocalVaultUnlocked(vaultRoot);
    return { document, snapshot };
  });
}

export async function trashLocalNote(input: LocalVaultTrashNoteInput, trashItem: TrashItem): Promise<LocalVaultSnapshot> {
  const vaultRoot = await requireActiveLocalVaultPath();
  return enqueueVaultOperation(vaultRoot, async () => {
    const note = await findNoteById(vaultRoot, input.noteId);
    await trashItem(resolveInsideVault(vaultRoot, note.relativePath));
    return scanLocalVaultUnlocked(vaultRoot);
  });
}

export async function createLocalFolder(input: LocalVaultCreateFolderInput): Promise<LocalVaultSnapshot> {
  const vaultRoot = await requireActiveLocalVaultPath();
  return enqueueVaultOperation(vaultRoot, async () => {
    const parentPath = normalizeRelativePath(input.parentPath);
    const folderPath = resolveInsideVault(vaultRoot, parentPath ? `${parentPath}/${sanitizeFileName(input.name)}` : sanitizeFileName(input.name));
    await mkdir(folderPath, { recursive: false });
    return scanLocalVaultUnlocked(vaultRoot);
  });
}

export async function renameLocalFolder(input: LocalVaultRenameFolderInput): Promise<LocalVaultSnapshot> {
  const vaultRoot = await requireActiveLocalVaultPath();
  return enqueueVaultOperation(vaultRoot, async () => {
    const source = resolveInsideVault(vaultRoot, input.relativePath);
    const target = join(dirname(source), sanitizeFileName(input.name));
    await assertCanonicalInsideVault(vaultRoot, source);
    await assertCanonicalInsideVault(vaultRoot, target);
    await rename(source, target);
    await remapManifestFolder(vaultRoot, normalizeRelativePath(input.relativePath)!, toVaultRelativePath(vaultRoot, target));
    return scanLocalVaultUnlocked(vaultRoot);
  });
}

export async function moveLocalFolder(input: LocalVaultMoveFolderInput): Promise<LocalVaultSnapshot> {
  const vaultRoot = await requireActiveLocalVaultPath();
  return enqueueVaultOperation(vaultRoot, async () => {
    const source = resolveInsideVault(vaultRoot, input.relativePath);
    const targetDirectory = resolveInsideVault(vaultRoot, input.parentPath);
    await assertCanonicalInsideVault(vaultRoot, source);
    await assertCanonicalInsideVault(vaultRoot, targetDirectory);
    await mkdir(targetDirectory, { recursive: true });
    const target = join(targetDirectory, basename(source));
    await rename(source, target);
    await remapManifestFolder(vaultRoot, normalizeRelativePath(input.relativePath)!, toVaultRelativePath(vaultRoot, target));
    return scanLocalVaultUnlocked(vaultRoot);
  });
}

export async function trashLocalFolder(input: LocalVaultTrashFolderInput, trashItem: TrashItem): Promise<LocalVaultSnapshot> {
  const vaultRoot = await requireActiveLocalVaultPath();
  return enqueueVaultOperation(vaultRoot, async () => {
    await trashItem(resolveInsideVault(vaultRoot, input.relativePath));
    return scanLocalVaultUnlocked(vaultRoot);
  });
}

export type LocalVaultWatcher = {
  close: () => void;
  pause: () => void;
  resume: (refresh?: boolean) => void;
};

export function watchLocalVault(
  vaultRoot: string,
  onChange: (snapshot: LocalVaultSnapshot) => void,
  watchFileSystem: WatchFileSystem = watch,
): LocalVaultWatcher {
  let watcher: FSWatcher | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let scanning = false;
  let scanAgain = false;
  let closed = false;
  let pauseDepth = 0;
  let dirtyWhilePaused = false;

  const runScan = async () => {
    if (closed) {
      return;
    }
    if (scanning) {
      scanAgain = true;
      return;
    }
    scanning = true;
    try {
      const snapshot = await scanLocalVault(vaultRoot);
      if (!closed) {
        onChange(snapshot);
      }
    } catch (error) {
      writeLog('local-vault', 'Failed to rescan local vault after filesystem event.', {
        message: error instanceof Error ? error.message : String(error),
      }, 'warn');
    } finally {
      scanning = false;
      if (!closed && scanAgain) {
        scanAgain = false;
        void runScan();
      }
    }
  };

  const notify = (_eventType?: string, filename?: string | Buffer | null) => {
    if (closed) {
      return;
    }
    if (filename && filename.toString().split(/[\\/]/).includes(MANIFEST_DIR)) {
      return;
    }
    if (pauseDepth > 0) {
      dirtyWhilePaused = true;
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      void runScan();
    }, 150);
  };

  try {
    watcher = watchFileSystem(vaultRoot, { recursive: true }, notify);
    watcher.on('error', (error) => {
      writeLog('local-vault', 'Local vault watcher failed.', { message: error.message }, 'warn');
    });
  } catch (error) {
    writeLog('local-vault', 'Failed to watch local vault.', {
      message: error instanceof Error ? error.message : String(error),
    }, 'warn');
  }

  return {
    close: () => {
      closed = true;
      scanAgain = false;
      if (timer) {
        clearTimeout(timer);
      }
      watcher?.close();
    },
    pause: () => {
      pauseDepth += 1;
      if (timer) {
        clearTimeout(timer);
        timer = null;
        dirtyWhilePaused = true;
      }
    },
    resume: (refresh = false) => {
      if (closed) {
        return;
      }

      pauseDepth = Math.max(0, pauseDepth - 1);
      if (pauseDepth === 0 && (refresh || dirtyWhilePaused)) {
        dirtyWhilePaused = false;
        void runScan();
      }
    },
  };
}
