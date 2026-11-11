import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogReturnFocusProvider, DialogTitle } from './dialog';

function Fixture({ open, returnTo }: { open: boolean; returnTo: () => HTMLElement | false | null }) {
  return (
    <DialogReturnFocusProvider value={returnTo}>
      <button type="button">Opener</button>
      <div role="textbox" aria-label="Editor" tabIndex={0} />
      <button type="button">Elsewhere</button>
      <Dialog open={open}>
        <DialogContent>
          <DialogTitle>Example</DialogTitle>
          <input aria-label="Field" />
        </DialogContent>
      </Dialog>
    </DialogReturnFocusProvider>
  );
}

function renderDialog(returnTo: () => HTMLElement | false | null) {
  const view = render(<Fixture open={false} returnTo={returnTo} />);
  screen.getByText('Opener').focus();
  view.rerender(<Fixture open returnTo={returnTo} />);
  return { close: () => view.rerender(<Fixture open={false} returnTo={returnTo} />) };
}

// While the dialog is open the page behind it is hidden from the accessibility tree.
const byLabel = (label: string) => document.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
const elsewhere = () => screen.getByText('Elsewhere');

describe('DialogContent return focus', () => {
  it('returns focus to the target the workbench names', async () => {
    const { close } = renderDialog(() => byLabel('Editor'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    close();
    await waitFor(() => expect(byLabel('Editor')).toHaveFocus());
  });

  it('leaves focus alone when the workbench says a command is moving it', async () => {
    const { close } = renderDialog(() => false);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    close();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(byLabel('Editor')).not.toHaveFocus();
  });

  it('keeps focus that a command already moved out of the dialog', async () => {
    const { close } = renderDialog(() => byLabel('Editor'));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    elsewhere().focus();
    close();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(elsewhere()).toHaveFocus();
  });
});
