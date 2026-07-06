import type {
  CreateNoteInput,
  OpenTextFileResult,
} from './electron-api';

const MARKDOWN_EXTENSION_PATTERN = /\.(md|markdown|txt)$/i;
const UNSAFE_FILE_NAME_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

function sanitizeFileNameCharacter(character: string) {
  return character.charCodeAt(0) <= 31 || UNSAFE_FILE_NAME_CHARS.has(character) ? '-' : character;
}

export function sanitizeMarkdownFileName(title: string) {
  const baseName = title
    .trim()
    .split('')
    .map(sanitizeFileNameCharacter)
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 120)
    .trim();

  return `${baseName || 'Untitled'}.md`;
}

function cleanMarkdownHeadingText(value: string) {
  return value
    .replace(/\s+#+\s*$/g, '')
    .trim();
}

function getFallbackTitleFromFileName(fileName: string) {
  return fileName
    .replace(MARKDOWN_EXTENSION_PATTERN, '')
    .trim()
    || 'Untitled';
}

export function extractMarkdownTitle(content: string, fileName: string) {
  const firstH1 = content
    .split(/\r?\n/)
    .map((line) => line.match(/^#(?!#)\s+(.+)$/)?.[1])
    .find((value): value is string => Boolean(value?.trim()));

  return firstH1
    ? cleanMarkdownHeadingText(firstH1) || getFallbackTitleFromFileName(fileName)
    : getFallbackTitleFromFileName(fileName);
}

export function buildMarkdownImportInput(file: OpenTextFileResult, parentFolderId?: string): CreateNoteInput {
  return {
    title: extractMarkdownTitle(file.content, file.fileName),
    content: file.content,
    ...(parentFolderId ? { parentFolderId } : {}),
  };
}

export function buildMarkdownExportInput(title: string, content: string) {
  return {
    defaultFileName: sanitizeMarkdownFileName(title || 'Untitled'),
    content,
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'Text', extensions: ['txt'] },
    ],
  };
}
