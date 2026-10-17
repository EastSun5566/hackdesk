import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AiCommandDialog } from './AiCommandDialog';

function renderDialog(onSubmit = vi.fn(async () => undefined), onOpenChange = vi.fn()) {
  render(
    <AiCommandDialog
      open
      title="New AI command"
      description="Runs on the selection."
      submitLabel="Create"
      initial={{ name: '', prompt: '', delivery: 'replace' }}
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, onOpenChange };
}

describe('AiCommandDialog', () => {
  it('needs a name and a prompt, then saves the trimmed command with its placement', async () => {
    const { onSubmit, onOpenChange } = renderDialog();
    const create = screen.getByRole('button', { name: 'Create' });
    expect(create).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Meeting notes ' } });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Turn into meeting notes ' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Add below' }));
    fireEvent.click(create);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Meeting notes', prompt: 'Turn into meeting notes', delivery: 'insert-below' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByLabelText('Name')).toHaveAttribute('maxLength', '60');
    expect(screen.getByLabelText('Prompt')).toHaveAttribute('maxLength', '2000');
  });

  it('stays open and shows why when saving fails', async () => {
    const { onOpenChange } = renderDialog(vi.fn(async () => { throw new Error("Error invoking remote method 'settings:update': Error: Disk full"); }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'Y' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Disk full');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
