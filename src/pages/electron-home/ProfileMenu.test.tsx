import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialogHost } from '@/components/ConfirmDialogHost';

import { ProfileMenu } from './ProfileMenu';

const user = { name: 'Michael', username: 'michael', photo: '' };

function openMenu(name: string) {
  fireEvent.pointerDown(screen.getByRole('button', { name }));
}

describe('ProfileMenu', () => {
  it('signs out only after confirming', async () => {
    const onSignOut = vi.fn();
    render(
      <>
        <ProfileMenu user={user} onOpenSettings={vi.fn()} onConnect={vi.fn()} onSignOut={onSignOut} />
        <ConfirmDialogHost />
      </>,
    );

    openMenu('Account: Michael');
    expect(await screen.findByRole('menuitem', { name: 'View Michael’s profile on HackMD' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign Out' }));

    const confirm = await screen.findByRole('button', { name: 'Sign Out' });
    expect(onSignOut).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(onSignOut).toHaveBeenCalledTimes(1));
  });

  it('offers to connect HackMD when no account is signed in', async () => {
    const onConnect = vi.fn();
    render(<ProfileMenu onOpenSettings={vi.fn()} onConnect={onConnect} onSignOut={vi.fn()} />);

    openMenu('Account: Not signed in');
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Connect HackMD…' }));
    expect(screen.queryByRole('menuitem', { name: 'Sign Out' })).not.toBeInTheDocument();
    await waitFor(() => expect(onConnect).toHaveBeenCalledTimes(1));
  });
});
