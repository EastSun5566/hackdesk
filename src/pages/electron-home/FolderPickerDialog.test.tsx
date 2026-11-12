import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { HackDeskElectronAPI } from '@/lib/electron-api';
import type { LocalDirectoryBrowseResult } from '@/lib/local-vault';
import { TooltipProvider } from '@/components/ui/tooltip';

import { FolderPickerDialog, useFolderPicker } from './FolderPickerDialog';

function listing(path: string, names: string[], parent: string | null = '/home/user'): LocalDirectoryBrowseResult {
  return {
    path,
    parent,
    home: '/home/user',
    entries: names.map((name) => ({ name, path: `${path}/${name}`, hasSubdirectories: false })),
  };
}

const HOME = listing('/home/user', ['Notes', 'Projects', '.hidden']);

function api(overrides: Partial<HackDeskElectronAPI['localVault']> = {}) {
  return {
    localVault: {
      browse: vi.fn(async (path?: string) => {
        if (path === '/home/user/Notes') return listing('/home/user/Notes', []);
        if (path && path !== '/home/user') throw new Error('That folder cannot be opened.');
        return HOME;
      }),
      choosePath: vi.fn(async () => ({ canceled: false as const })),
      createDirectory: vi.fn(async ({ parentPath, name }: { parentPath: string; name: string }) => ({ path: `${parentPath}/${name}` })),
      ...overrides,
    },
  } as unknown as HackDeskElectronAPI;
}

function renderDialog(props: Partial<Parameters<typeof FolderPickerDialog>[0]> = {}) {
  return render(
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <FolderPickerDialog api={api()} open onOpenChange={vi.fn()} onChoose={vi.fn()} {...props} />
    </TooltipProvider>,
  );
}

describe('FolderPickerDialog', () => {
  it('lists the home folder on open and descends on click', async () => {
    const onChoose = vi.fn();
    renderDialog({ onChoose });

    expect(await screen.findByRole('option', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Choose “user”/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('option', { name: 'Notes' }));
    expect(await screen.findByRole('option', { name: 'Parent folder' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Notes' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Choose “Notes”/ }));
    expect(onChoose).toHaveBeenCalledWith('/home/user/Notes');
  });

  it('filters folders and opens the highlighted match with Enter', async () => {
    renderDialog();
    expect(await screen.findByRole('option', { name: 'Notes' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter folders' }), { target: { value: 'notes' } });
    expect(screen.queryByRole('option', { name: 'Projects' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter folders' }), { key: 'Enter' });
    expect(await screen.findByRole('option', { name: 'Parent folder' })).toBeInTheDocument();
  });

  it('reports no matches for a filter with no folders', async () => {
    renderDialog();
    expect(await screen.findByRole('option', { name: 'Notes' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter folders' }), { target: { value: 'zzz' } });
    expect(await screen.findByRole('status')).toHaveTextContent('No folders match.');
  });

  it('moves the highlight with arrow keys and goes up with Backspace', async () => {
    renderDialog();
    expect(await screen.findByRole('option', { name: 'Notes' })).toBeInTheDocument();

    const listbox = screen.getByRole('listbox', { name: 'Folders' });
    // Row 0 is the parent folder; arrows wrap around it.
    fireEvent.keyDown(listbox, { key: 'ArrowUp' });
    expect(screen.getByRole('option', { name: 'Projects' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: 'Backspace' });
    expect(await screen.findByRole('option', { name: 'Notes' })).toBeInTheDocument();
  });

  it('hides dot-folders until the filter starts with a dot, and marks folders already added', async () => {
    renderDialog({ addedPaths: ['/home/user/Notes'] });
    // The mark is a description, so the folder keeps its plain name.
    expect(await screen.findByRole('option', { name: 'Notes' })).toHaveAttribute('aria-description', 'Already added');
    expect(screen.getByRole('option', { name: 'Projects' })).not.toHaveAttribute('aria-description');
    expect(screen.getByRole('option', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '.hidden' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter folders' }), { target: { value: '.hid' } });
    expect(screen.getByRole('option', { name: '.hidden' })).toBeInTheDocument();
  });

  it('creates a folder and filters to it', async () => {
    const electronApi = api();
    renderDialog({ api: electronApi });

    expect(await screen.findByRole('option', { name: 'Notes' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New Folder' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New folder name' }), { target: { value: 'Fresh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(electronApi.localVault.createDirectory).toHaveBeenCalledWith({ parentPath: '/home/user', name: 'Fresh' }));
    expect(screen.getByRole('combobox', { name: 'Filter folders' })).toHaveValue('Fresh');
  });

  it('navigates and adds a highlighted folder directly from the filter', async () => {
    const onChoose = vi.fn();
    renderDialog({ onChoose });
    await screen.findByRole('option', { name: 'Notes' });
    const filter = screen.getByRole('combobox', { name: 'Filter folders' });
    fireEvent.keyDown(filter, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(filter, { key: 'Enter', metaKey: true });
    expect(onChoose).toHaveBeenCalledOnce();
    expect(onChoose).toHaveBeenCalledWith('/home/user/Notes');
  });

  it('reports a browse failure with a retry', async () => {
    const failing = api({ browse: vi.fn(async () => { throw new Error('That folder cannot be opened.'); }) });
    const onOpenChange = vi.fn();
    renderDialog({ api: failing, onOpenChange });

    expect(await screen.findByRole('alert')).toHaveTextContent('That folder cannot be opened.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('resolves the picked folder through the hook', async () => {
    let pick!: () => Promise<string | null>;
    function Harness() {
      const picker = useFolderPicker(api());
      pick = picker.pickFolder;
      return picker.dialog;
    }
    render(
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        <Harness />
      </TooltipProvider>,
    );

    let result: string | null | undefined;
    await act(async () => {
      void pick().then((path) => { result = path; });
    });
    expect(await screen.findByRole('option', { name: 'Notes' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Choose “user”/ }));
    });
    expect(result).toBe('/home/user');
  });

  it('resolves no folder when the picker is cancelled', async () => {
    let pick!: () => Promise<string | null>;
    function Harness() {
      const picker = useFolderPicker(api());
      pick = picker.pickFolder;
      return picker.dialog;
    }
    render(
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        <Harness />
      </TooltipProvider>,
    );

    let result: string | null | undefined = 'pending';
    await act(async () => {
      void pick().then((path) => { result = path; });
    });
    expect(await screen.findByRole('option', { name: 'Notes' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    expect(result).toBeNull();
  });
});
