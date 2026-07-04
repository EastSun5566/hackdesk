import { describe, expect, it, vi } from 'vitest';

vi.mock('./logging', () => ({
  writeLog: vi.fn(),
}));

import {
  createFolderInputSchema,
  createNoteInputSchema,
  folderOrderSchema,
  localVaultImportAttachmentInputSchema,
  openHackmdEditorInputSchema,
  saveTextFileInputSchema,
  settingsUpdateSchema,
  themeSurfaceInputSchema,
  updateNoteInputSchema,
  uploadNoteImageInputSchema,
  validateIpcInput,
  validateNonEmptyString,
} from './ipc-validation';
import { writeLog } from './logging';

describe('IPC runtime validation', () => {
  it('accepts valid HackMD note and folder payloads', () => {
    expect(validateIpcInput('hackmd:create-note', createNoteInputSchema, {
      title: 'Spec',
      content: '# Spec',
      tags: ['desktop'],
      readPermission: 'signed_in',
      writePermission: 'owner',
      commentPermission: 'owners',
      suggestEditPermission: 'owners',
      noteFeatures: { comments: true },
      parentFolderId: 'folder-1',
    })).toMatchObject({ title: 'Spec', readPermission: 'signed_in' });

    expect(validateIpcInput('hackmd:create-folder', createFolderInputSchema, {
      name: 'Engineering',
      icon: '1F525',
      color: '#FF6B6B',
    })).toMatchObject({ name: 'Engineering' });
  });

  it('rejects missing identifiers, wrong primitives, and unknown object fields', () => {
    expect(() => validateNonEmptyString('hackmd:get-note', '  ')).toThrow(/Invalid hackmd:get-note payload/);
    expect(() => validateIpcInput('hackmd:update-note', updateNoteInputSchema, {
      title: 'Updated',
      unexpected: true,
    })).toThrow(/Unrecognized key/);
    expect(() => validateIpcInput('hackmd:update-folder-order', folderOrderSchema, {
      root: ['folder-1'],
      nested: [42],
    })).toThrow(/Invalid/);
    expect(writeLog).toHaveBeenCalledWith(
      'ipc',
      'invalid IPC payload',
      expect.any(Object),
      'warn',
    );
  });

  it('validates native file, editor, and image upload inputs', () => {
    expect(validateIpcInput('app:save-text-file', saveTextFileInputSchema, {
      defaultFileName: 'note.md',
      content: '# Note',
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    })).toMatchObject({ defaultFileName: 'note.md' });

    expect(validateIpcInput('shell:open-hackmd-editor', openHackmdEditorInputSchema, {
      publishType: 'edit',
      shortId: 'abc',
      userPath: 'michael',
      teamPath: null,
      permalink: null,
      publishLink: 'https://hackmd.io/s/abc',
    })).toMatchObject({ shortId: 'abc' });

    expect(validateIpcInput('hackmd:upload-note-image', uploadNoteImageInputSchema, {
      fileName: 'diagram.png',
      mimeType: 'image/png',
      bytes: new ArrayBuffer(4),
    })).toMatchObject({ fileName: 'diagram.png' });

    expect(validateIpcInput('local-vault:import-attachment', localVaultImportAttachmentInputSchema, {
      noteId: 'note-1',
      fileName: 'diagram.png',
      mimeType: 'image/png',
      bytes: new ArrayBuffer(4),
    })).toMatchObject({ noteId: 'note-1', fileName: 'diagram.png' });

    expect(validateIpcInput('app:set-theme-surface', themeSurfaceInputSchema, {
      mode: 'dark',
      background: '#27272A',
    })).toMatchObject({ mode: 'dark', background: '#27272A' });

    expect(validateIpcInput('settings:update', settingsUpdateSchema, {
      onboarding: { hackmdTokenSetupDeferred: true },
      editor: { mode: 'vim' },
      appearance: {
        theme: 'dark',
        presetId: 'dracula',
        customSeed: {},
        typography: {
          uiFontStack: 'system-ui, sans-serif',
          editorFontStack: '"JetBrains Mono", ui-monospace, monospace',
          uiFontSize: 16,
          editorFontSize: 18,
        },
      },
    })).toMatchObject({
      onboarding: { hackmdTokenSetupDeferred: true },
      editor: { mode: 'vim' },
      appearance: { presetId: 'dracula' },
    });

    expect(validateIpcInput('settings:update', settingsUpdateSchema, {
      appearance: {
        theme: 'light',
        presetId: 'gruvbox',
        customSeed: {},
        typography: {
          uiFontStack: 'system-ui, sans-serif',
          editorFontStack: '"JetBrains Mono", ui-monospace, monospace',
          uiFontSize: 14,
          editorFontSize: 20,
        },
      },
    })).toMatchObject({
      appearance: { presetId: 'gruvbox' },
    });
  });

  it('rejects unknown editor modes in settings updates', () => {
    expect(() => validateIpcInput('settings:update', settingsUpdateSchema, {
      editor: { mode: 'emacs' },
    })).toThrow(/Invalid option/);
  });

  it('rejects unsafe theme font stacks in settings updates', () => {
    expect(() => validateIpcInput('settings:update', settingsUpdateSchema, {
      appearance: {
        theme: 'dark',
        presetId: 'hackmd-neo',
        customSeed: {},
        typography: {
          uiFontStack: 'Inter; color: red',
          editorFontStack: '"Source Code Pro", ui-monospace, monospace',
          uiFontSize: 14,
          editorFontSize: 14,
        },
      },
    })).toThrow(/Invalid/);
  });

  it.each([
    { uiFontSize: 11, editorFontSize: 14 },
    { uiFontSize: 19, editorFontSize: 14 },
    { uiFontSize: 14.5, editorFontSize: 14 },
    { uiFontSize: 14, editorFontSize: 9 },
    { uiFontSize: 14, editorFontSize: 33 },
  ])('rejects invalid theme font sizes in settings updates: %j', (fontSizes) => {
    expect(() => validateIpcInput('settings:update', settingsUpdateSchema, {
      appearance: {
        theme: 'dark',
        presetId: 'hackmd-neo',
        customSeed: {},
        typography: {
          uiFontStack: 'Inter, system-ui, sans-serif',
          editorFontStack: '"Source Code Pro", ui-monospace, monospace',
          ...fontSizes,
        },
      },
    })).toThrow(/Invalid/);
  });

  it('rejects unsafe native file and image upload shapes', () => {
    expect(() => validateIpcInput('app:save-text-file', saveTextFileInputSchema, {
      defaultFileName: '',
      content: '# Note',
    })).toThrow(/Too small/);

    expect(() => validateIpcInput('hackmd:upload-note-image', uploadNoteImageInputSchema, {
      fileName: 'diagram.png',
      mimeType: 'image/png',
      bytes: [1, 2, 3],
    })).toThrow(/expected ArrayBuffer/);

    expect(() => validateIpcInput('local-vault:import-attachment', localVaultImportAttachmentInputSchema, {
      noteId: 'note-1',
      fileName: 'diagram.png',
      mimeType: 'image/png',
      bytes: [1, 2, 3],
    })).toThrow(/expected ArrayBuffer/);

    expect(() => validateIpcInput('app:set-theme-surface', themeSurfaceInputSchema, {
      mode: 'purple',
      background: 'javascript:alert(1)',
    })).toThrow(/Invalid/);
  });
});
