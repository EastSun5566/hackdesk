import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RenameNoteDialog } from './RenameNoteDialog';

function setup(overrides: Partial<Parameters<typeof RenameNoteDialog>[0]> = {}) {
  const props = { open: true, title: 'Roadmap', isSaving: false, localVault: false, onOpenChange: vi.fn(), onRename: vi.fn(), ...overrides };
  const view = render(<RenameNoteDialog {...props} />);
  return { ...props, view };
}

describe('RenameNoteDialog', () => {
  it('starts from the current title and renames with the trimmed new one', () => {
    const { onRename } = setup();
    const field = screen.getByLabelText('Title');
    expect(field).toHaveValue('Roadmap');
    fireEvent.change(field, { target: { value: '  Roadmap 2027  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(onRename).toHaveBeenCalledWith('Roadmap 2027');
  });

  it('closes without saving when the title is unchanged, and blocks an empty title', () => {
    const { onRename, onOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(onRename).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Rename' })).toBeDisabled();
  });

  it('says a Local Vault file takes the new name', () => {
    setup({ localVault: true });
    expect(screen.getByText('The file takes the new name when you rename it.')).toBeInTheDocument();
  });

  it('starts over from the note title each time it opens', () => {
    const { view, onOpenChange, onRename } = setup();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Abandoned' } });
    view.rerender(<RenameNoteDialog open={false} title="Roadmap" isSaving={false} localVault={false} onOpenChange={onOpenChange} onRename={onRename} />);
    view.rerender(<RenameNoteDialog open title="Roadmap" isSaving={false} localVault={false} onOpenChange={onOpenChange} onRename={onRename} />);
    expect(screen.getByLabelText('Title')).toHaveValue('Roadmap');
  });
});
