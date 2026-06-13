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

function collectDebugTreeEntries(sourceRoot: string, sourcePath: string, zipRoot: string, entries: ZipArchiveEntry[]) {
  if (!existsSync(sourcePath)) {
    return;
  }

  for (const entry of readdirSync(sourcePath, { withFileTypes: true })) {
    const sourceEntryPath = join(sourcePath, entry.name);

    if (entry.isDirectory()) {
      collectDebugTreeEntries(sourceRoot, sourceEntryPath, zipRoot, entries);
      continue;
    }

    const stats = statSync(sourceEntryPath);
    if (stats.size <= MAX_COPIED_FILE_BYTES) {
      entries.push({
        name: join(zipRoot, relative(sourceRoot, sourceEntryPath)),
        data: readFileSync(sourceEntryPath),
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
  collectDebugTreeEntries(logsRootPath, logsRootPath, 'logs', entries);
  collectDebugTreeEntries(crashDumpsPath, crashDumpsPath, 'crash-dumps', entries);
  writeFileSync(outputPath, createZipArchive(entries));

  await shell.showItemInFolder(outputPath);
  writeLog('main', 'debug logs exported', { outputPath });
  return outputPath;
}

export function recordFatalRendererError(error: FatalRendererError) {
  writeLog('renderer', 'fatal renderer error', error, 'error');
}
