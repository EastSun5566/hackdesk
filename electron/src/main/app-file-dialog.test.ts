import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: mocks.showOpenDialog,
    showSaveDialog: mocks.showSaveDialog,
  },
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: mocks.readFile,
    writeFile: mocks.writeFile,
  },
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
}));

describe('app file dialogs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes text files through the save dialog', async () => {
    const { saveTextFile } = await import('./app-file-dialog');
    mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/tmp/export.md' });

    await expect(saveTextFile({
      defaultFileName: 'Export.md',
      content: '# Export',
    })).resolves.toBe('/tmp/export.md');

    expect(mocks.showSaveDialog).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'Export.md',
    }));
    expect(mocks.writeFile).toHaveBeenCalledWith('/tmp/export.md', '# Export', 'utf8');
  });

  it('returns null when save is cancelled', async () => {
    const { saveTextFile } = await import('./app-file-dialog');
    mocks.showSaveDialog.mockResolvedValue({ canceled: true });

    await expect(saveTextFile({
      defaultFileName: 'Export.md',
      content: '# Export',
    })).resolves.toBeNull();

    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it('reads text files through the open dialog', async () => {
    const { openTextFile } = await import('./app-file-dialog');
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/import.md'] });
    mocks.readFile.mockResolvedValue('# Imported');

    await expect(openTextFile({})).resolves.toEqual({
      filePath: '/tmp/import.md',
      fileName: 'import.md',
      content: '# Imported',
    });

    expect(mocks.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
      properties: ['openFile'],
    }));
    expect(mocks.readFile).toHaveBeenCalledWith('/tmp/import.md', 'utf8');
  });

  it('returns null when open is cancelled', async () => {
    const { openTextFile } = await import('./app-file-dialog');
    mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await expect(openTextFile({})).resolves.toBeNull();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
});
