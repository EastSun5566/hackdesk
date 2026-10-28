import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FolderPathSummary, HackDeskElectronAPI, NoteSummary } from '@/lib/electron-api';
import { buildHackmdFolderTree } from '@/lib/hackmd-folders';
import { findTemplatesFolder, listTemplates } from '@/lib/note-templates';

import { LOCAL_VAULT_TEAM_PATH } from './local-vault-adapter';
import { TemplatePickerDialog } from './TemplatePickerDialog';
import { useNoteTemplates } from './useNoteTemplates';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('@/components/ui/toast', () => ({ toast: { error: toastError } }));

const folder = (id: string, name: string, parentId: string | null = null): FolderPathSummary => ({ id, name, parentId, icon: null, color: null, clientId: null });
const TEMPLATES = folder('templates', 'templates');
const MEETINGS = folder('meetings', 'Meetings', 'templates');
const PROJECTS = folder('projects', 'Projects');
const NESTED_TEMPLATES = folder('nested', 'Templates', 'projects');

function note(id: string, title: string, folderPaths: FolderPathSummary[], teamPath: string | null = null): NoteSummary {
  return {
    id, title, folderPaths, teamPath, shortId: id, description: '', tags: [], content: null, publishLink: '', permalink: null, userPath: null,
    publishType: 'edit', readPermission: 'owner', writePermission: 'owner', lastChangeUser: null,
    updatedAtMillis: null, createdAtMillis: null, publishedAtMillis: null, tagsUpdatedAtMillis: null, titleUpdatedAtMillis: null,
  };
}

const tree = buildHackmdFolderTree([
  note('weekly', 'Weekly sync', [TEMPLATES, MEETINGS]),
  note('readme', 'Project README', [TEMPLATES]),
  note('plan', 'Plan', [PROJECTS]),
  note('not-a-template', 'Nested', [PROJECTS, NESTED_TEMPLATES]),
], [TEMPLATES, MEETINGS, PROJECTS, NESTED_TEMPLATES]);

afterEach(() => {
  toastError.mockClear();
});

describe('templates', () => {
  it('are the notes under the top-level Templates folder, by title', () => {
    expect(findTemplatesFolder(tree)?.id).toBe('templates');
    expect(listTemplates(tree).map(entry => entry.note.title)).toEqual(['Project README', 'Weekly sync']);
    expect(findTemplatesFolder(buildHackmdFolderTree([note('plan', 'Plan', [PROJECTS])], [PROJECTS]))).toBeNull();
  });

  it('start a draft with the template text, from HackMD or the vault', async () => {
    const getNote = vi.fn(async () => ({ source: 'cached' as const, data: { content: '# Weekly sync\n\n## Agenda' } }));
    const readNote = vi.fn(async () => ({ content: '# Vault template' }));
    const api = { hackmd: { getNote }, localVault: { readNote } } as unknown as HackDeskElectronAPI;
    const openDraftNote = vi.fn();
    const { result } = renderHook(() => useNoteTemplates({ api, folderTree: tree, openDraftNote, saveAsTemplate: vi.fn() }));

    act(() => result.current.setPickerOpen(true));
    await act(() => result.current.chooseTemplate(result.current.templates[1]!));
    expect(getNote).toHaveBeenCalledWith('weekly', null);
    expect(openDraftNote).toHaveBeenCalledWith({ title: 'Weekly sync', content: '# Weekly sync\n\n## Agenda' });
    expect(result.current.pickerOpen).toBe(false);

    const vaultTemplate = { note: note('Templates/vault.md', 'Vault', [], LOCAL_VAULT_TEAM_PATH), folderLabel: '', folderPath: [] };
    await act(() => result.current.chooseTemplate(vaultTemplate));
    expect(readNote).toHaveBeenCalledWith('Templates/vault.md');
    expect(openDraftNote).toHaveBeenLastCalledWith({ title: 'Vault', content: '# Vault template' });
  });

  it('report a template that cannot be read, and keep the picker open', async () => {
    const api = { hackmd: { getNote: vi.fn(async () => ({ source: 'error' as const, error: 'Offline' })) } } as unknown as HackDeskElectronAPI;
    const openDraftNote = vi.fn();
    const { result } = renderHook(() => useNoteTemplates({ api, folderTree: tree, openDraftNote, saveAsTemplate: vi.fn() }));
    act(() => result.current.setPickerOpen(true));
    await act(() => result.current.chooseTemplate(result.current.templates[0]!));
    expect(toastError).toHaveBeenCalledWith('Offline');
    expect(openDraftNote).not.toHaveBeenCalled();
    expect(result.current.pickerOpen).toBe(true);
  });

  it('save the open note into the Templates folder, or create it', () => {
    const saveAsTemplate = vi.fn();
    const document = { ...note('plan', 'Plan', [PROJECTS]), content: 'saved' };
    const { result, rerender } = renderHook(({ folderTree }) => useNoteTemplates({ folderTree, openDraftNote: vi.fn(), saveAsTemplate }), { initialProps: { folderTree: tree } });
    result.current.saveDocumentAsTemplate(document, { title: 'Plan', content: 'edited' });
    expect(saveAsTemplate).toHaveBeenCalledWith({ title: 'Plan', content: 'edited', templatesFolderId: 'templates' });

    rerender({ folderTree: buildHackmdFolderTree([], []) });
    result.current.saveDocumentAsTemplate(document, { title: 'Plan', content: 'edited' });
    expect(saveAsTemplate).toHaveBeenLastCalledWith({ title: 'Plan', content: 'edited', templatesFolderId: null });
  });
});

describe('TemplatePickerDialog', () => {
  it('lists templates with their subfolder and starts the chosen one', async () => {
    const onChoose = vi.fn(async () => undefined);
    render(<TemplatePickerDialog open onOpenChange={vi.fn()} templates={listTemplates(tree)} onChoose={onChoose} />);
    expect(screen.getByRole('option', { name: /Weekly sync\s*Meetings/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: /Project README/ }));
    await waitFor(() => expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ note: expect.objectContaining({ id: 'readme' }) })));
  });

  it('explains where templates come from when there are none', () => {
    render(<TemplatePickerDialog open onOpenChange={vi.fn()} templates={[]} onChoose={vi.fn()} />);
    expect(screen.getByText('No templates yet. Add notes to a Templates folder, or use Save as Template.')).toBeTruthy();
  });
});
