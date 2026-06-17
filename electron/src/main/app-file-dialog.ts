import type { BrowserWindow } from 'electron';
import { dialog } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

import type {
  AppFileFilter,
  OpenTextFileInput,
  OpenTextFileResult,
  SaveTextFileInput,
} from '../../../src/lib/electron-api';

const MARKDOWN_FILTERS: AppFileFilter[] = [
  { name: 'Markdown', extensions: ['md', 'markdown'] },
  { name: 'Text', extensions: ['txt'] },
];

function getFilters(filters: AppFileFilter[] | undefined) {
  return filters && filters.length > 0 ? filters : MARKDOWN_FILTERS;
}

export async function saveTextFile(input: SaveTextFileInput, parentWindow?: BrowserWindow | null) {
  const options = {
    defaultPath: input.defaultFileName,
    filters: getFilters(input.filters),
  };
  const result = parentWindow
    ? await dialog.showSaveDialog(parentWindow, options)
    : await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) {
    return null;
  }

  await writeFile(result.filePath, input.content, 'utf8');
  return result.filePath;
}

export async function openTextFile(input: OpenTextFileInput, parentWindow?: BrowserWindow | null): Promise<OpenTextFileResult | null> {
  const options = {
    properties: ['openFile'],
    filters: getFilters(input.filters),
  } as const;
  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, options)
    : await dialog.showOpenDialog(options);

  const filePath = result.filePaths[0];
  if (result.canceled || !filePath) {
    return null;
  }

  return {
    filePath,
    fileName: basename(filePath),
    content: await readFile(filePath, 'utf8'),
  };
}
