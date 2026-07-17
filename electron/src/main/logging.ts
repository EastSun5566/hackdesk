import { app, crashReporter, shell } from 'electron';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, relative } from 'node:path';

import type { FatalRendererError } from '../../../src/lib/electron-api';
import { createZipArchive, type ZipArchiveEntry } from './zip-archive';

const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_COPIED_FILE_BYTES = 25 * 1024 * 1024;
const MAX_DEBUG_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_DEBUG_ARCHIVE_FILES = 200;

let logsRootPath = '';
let currentRunPath = '';

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function safeLogName(scope: string) {
  return scope.replace(/[^a-z0-9_.-]/gi, '-').toLowerCase();
}

function ensureLoggingPaths() {
  if (!logsRootPath) {
    logsRootPath = join(app.getPath('userData'), 'logs');
  }

  if (!currentRunPath) {
    currentRunPath = join(logsRootPath, timestamp());
  }

  mkdirSync(currentRunPath, { recursive: true });
}

function cleanupOldLogs() {
  if (!existsSync(logsRootPath)) {
    return;
  }

  const cutoff = Date.now() - LOG_RETENTION_MS;
  for (const entry of readdirSync(logsRootPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const fullPath = join(logsRootPath, entry.name);
    const stats = statSync(fullPath);
    if (stats.mtimeMs < cutoff) {
      rmSync(fullPath, { recursive: true, force: true });
    }
  }
}

export function initLogging() {
  ensureLoggingPaths();
  cleanupOldLogs();
  writeLog('main', 'logging started', { currentRunPath });
}

export function initCrashReporter() {
  const crashDumpsPath = join(app.getPath('userData'), 'crash-dumps');
  app.setPath('crashDumps', crashDumpsPath);
  crashReporter.start({
    uploadToServer: false,
    compress: true,
  });
  writeLog('main', 'crash reporter started', { crashDumpsPath });
}

export function writeLog(scope: string, message: string, details?: unknown, level: 'info' | 'warn' | 'error' = 'info') {
  ensureLoggingPaths();

  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    scope,
    message,
    details,
  });

  appendFileSync(join(currentRunPath, `${safeLogName(scope)}.log`), `${line}\n`);
}

type DebugFile = { path: string; name: string; size: number; mtimeMs: number };

function collectDebugFiles(sourceRoot: string, sourcePath: string, zipRoot: string, files: DebugFile[]) {
  if (!existsSync(sourcePath)) {
    return;
  }

  for (const entry of readdirSync(sourcePath, { withFileTypes: true })) {
    const sourceEntryPath = join(sourcePath, entry.name);

    if (entry.isDirectory()) {
      collectDebugFiles(sourceRoot, sourceEntryPath, zipRoot, files);
      continue;
    }

    const stats = statSync(sourceEntryPath);
    if (stats.size <= MAX_COPIED_FILE_BYTES) {
      files.push({
        path: sourceEntryPath,
        name: join(zipRoot, relative(sourceRoot, sourceEntryPath)),
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      });
    }
  }
}

export async function exportDebugLogs() {
  ensureLoggingPaths();

  const outputPath = join(app.getPath('downloads'), `hackdesk-debug-${timestamp()}.zip`);
  const crashDumpsPath = app.getPath('crashDumps');
  const manifest = JSON.stringify({
    appName: app.getName(),
    appVersion: app.getVersion(),
    generatedAt: new Date().toISOString(),
    archiveFormat: 'zip',
    logsRoot: basename(logsRootPath),
  }, null, 2);
  const entries: ZipArchiveEntry[] = [
    {
      name: 'manifest.json',
      data: Buffer.from(manifest),
    },
  ];

  writeLog('main', 'debug log export started', { outputPath });
  const files: DebugFile[] = [];
  collectDebugFiles(logsRootPath, logsRootPath, 'logs', files);
  collectDebugFiles(crashDumpsPath, crashDumpsPath, 'crash-dumps', files);
  files.sort((left, right) => right.mtimeMs - left.mtimeMs);
  let includedBytes = 0;
  let omittedFiles = 0;
  let omittedBytes = 0;
  for (const file of files) {
    if (entries.length - 1 >= MAX_DEBUG_ARCHIVE_FILES || includedBytes + file.size > MAX_DEBUG_ARCHIVE_BYTES) {
      omittedFiles += 1;
      omittedBytes += file.size;
      continue;
    }
    entries.push({ name: file.name, data: readFileSync(file.path) });
    includedBytes += file.size;
  }
  entries.push({
    name: 'omitted.json',
    data: Buffer.from(JSON.stringify({ omittedFiles, omittedBytes, limits: {
      files: MAX_DEBUG_ARCHIVE_FILES,
      bytes: MAX_DEBUG_ARCHIVE_BYTES,
    } }, null, 2)),
  });
  writeFileSync(outputPath, createZipArchive(entries));

  await shell.showItemInFolder(outputPath);
  writeLog('main', 'debug logs exported', { outputPath });
  return outputPath;
}

export function recordFatalRendererError(error: FatalRendererError) {
  writeLog('renderer', 'fatal renderer error', error, 'error');
}
