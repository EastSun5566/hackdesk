import { describe, expect, it } from 'vitest';

import {
  buildMarkdownExportInput,
  buildMarkdownImportInput,
  extractMarkdownTitle,
  sanitizeMarkdownFileName,
} from './electron-note-portability';

describe('electron note portability helpers', () => {
  it('sanitizes markdown export file names', () => {
    expect(sanitizeMarkdownFileName('Release: notes / draft?')).toBe('Release- notes - draft-.md');
    expect(sanitizeMarkdownFileName('   ...   ')).toBe('Untitled.md');
  });

  it('extracts the first H1 title from markdown content', () => {
    expect(extractMarkdownTitle('intro\n# Imported Note ###\nbody', 'fallback.md')).toBe('Imported Note');
    expect(extractMarkdownTitle('## Not H1\nbody', 'fallback.markdown')).toBe('fallback');
    expect(extractMarkdownTitle('', 'plain.txt')).toBe('plain');
  });

  it('builds import input with an optional concrete parent folder', () => {
    expect(buildMarkdownImportInput({
      filePath: '/tmp/import.md',
      fileName: 'import.md',
      content: '# Imported\n\nBody',
    }, 'folder-1')).toEqual({
      title: 'Imported',
      content: '# Imported\n\nBody',
      parentFolderId: 'folder-1',
    });

    expect(buildMarkdownImportInput({
      filePath: '/tmp/root.md',
      fileName: 'root.md',
      content: 'Body',
    })).toEqual({
      title: 'root',
      content: 'Body',
    });
  });

  it('builds export input for markdown save dialogs', () => {
    expect(buildMarkdownExportInput('Test note', '# Test note')).toEqual({
      defaultFileName: 'Test note.md',
      content: '# Test note',
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    });
  });
});
