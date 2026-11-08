import { AlertCircle, ChevronsUpDown, ExternalLink, LogIn, LogOut, Settings2, UserCog, UserRound } from 'lucide-react';
import { useState } from 'react';

import { confirmDialog } from '@/components/ConfirmDialogHost';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/toast';
import { getHackDeskAPI } from '@/lib/electron-api';
import type { UserSummary } from '@/lib/electron-api';
import { cn } from '@/lib/utils';

import { ActionMenuShortcut } from './ActionShortcutContext';
import { PersonalWorkspaceIcon } from './WorkspaceIcon';

type ProfileUser = Pick<UserSummary, 'name' | 'username' | 'photo'>;

const HACKMD_ORIGIN = 'https://hackmd.io';

function openOnHackmd(path: string) {
  const api = getHackDeskAPI();
  if (!api?.shell.openExternal) {
    toast.error('HackMD links open only in the desktop app.');
    return;
  }
  void api.shell.openExternal(`${HACKMD_ORIGIN}${path}`).catch((error) => {
    toast.error(error instanceof Error ? error.message : 'Couldn’t open HackMD.');
  });
}

export function getProfileDisplayName(user: ProfileUser) {
  return user.name.trim() || user.username.trim() || 'HackMD account';
}

/**
 * The account hub at the bottom of the sidebar: who you are on HackMD, links to your profile
 * there, and signing out. Built as a list of accounts with one entry, so more can join it later.
 */
export function ProfileMenu({
  user,
  needsAttention,
  attentionTone = 'destructive',
  loading,
  onOpenSettings,
  onConnect,
  onSignOut,
}: {
  user?: ProfileUser;
  needsAttention?: boolean;
  attentionTone?: 'destructive' | 'primary';
  loading?: boolean;
  onOpenSettings: () => void;
  /** Opens the HackMD connection settings. Shown while no account is connected. */
  onConnect: () => void;
  /** Leave it out to hide Sign Out. */
  onSignOut?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const displayName = user ? getProfileDisplayName(user) : 'Not signed in';
  const runAfterClose = (action: () => void) => {
    setOpen(false);
    window.setTimeout(action, 0);
  };
  const confirmSignOut = async () => {
    if (!onSignOut) return;
    const { confirmed } = await confirmDialog({
      message: 'Sign out of HackMD?',
      detail: 'Removes the saved token from this computer. Your notes on HackMD and in your vault stay as they are.',
      confirmLabel: 'Sign Out',
      destructive: true,
    });
    if (confirmed) onSignOut();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={needsAttention ? `Account: ${displayName}. HackMD account needs attention` : `Account: ${displayName}`}
          title={user ? `${displayName} @${user.username}` : undefined}
          className="app-region-no-drag flex h-8 min-w-0 flex-1 items-center gap-2 rounded px-1.5 text-left text-sm text-text-default transition-colors hover:bg-background-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring data-[popup-open]:bg-background-hover"
        >
        {user
          ? <PersonalWorkspaceIcon user={user} className="size-5" testId="sidebar-footer-avatar" />
          : <UserRound aria-hidden="true" className="size-4 shrink-0 text-icon-default" />}
        <span className="min-w-0 flex-1 truncate">{displayName}</span>
        {needsAttention ? (
          <AlertCircle
            aria-hidden="true"
            data-testid="sidebar-account-attention"
            className={cn('size-3.5 shrink-0', attentionTone === 'primary' ? 'text-primary-default' : 'text-destructive-default')}
          />
        ) : loading ? (
          <span aria-hidden="true" data-testid="sidebar-account-loading" className="block size-1.5 shrink-0 rounded-full bg-text-subtle opacity-70 motion-safe:animate-pulse" />
        ) : (
          <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-icon-default" />
        )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        {user ? (
          <>
            {/* The account itself: opens the HackMD profile. */}
            <DropdownMenuItem
              aria-label={`View ${displayName}’s profile on HackMD`}
              onSelect={(event) => {
                event.preventDefault();
                runAfterClose(() => openOnHackmd(`/@${encodeURIComponent(user.username)}`));
              }}
            >
              <PersonalWorkspaceIcon user={user} className="size-8" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-text-emphasize">{displayName}</span>
                <span className="truncate text-xs text-text-subtle">@{user.username}</span>
              </span>
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(event) => {
              event.preventDefault();
              runAfterClose(() => openOnHackmd('/settings'));
            }}>
              <UserCog aria-hidden="true" />
              HackMD Account
              <ExternalLink aria-hidden="true" className="ml-auto size-3.5" />
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onSelect={(event) => {
            event.preventDefault();
            runAfterClose(onConnect);
          }}>
            <LogIn aria-hidden="true" />
            Connect HackMD…
          </DropdownMenuItem>
        )}
        {/* Signed in, Settings joins the account links; otherwise it stands apart from Connect. */}
        {user ? null : <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={(event) => {
          event.preventDefault();
          runAfterClose(onOpenSettings);
        }}>
          <Settings2 aria-hidden="true" />
          Settings…
          <ActionMenuShortcut actionId="open-settings" />
        </DropdownMenuItem>
        {user && onSignOut ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(event) => {
              event.preventDefault();
              runAfterClose(() => void confirmSignOut());
            }}>
              <LogOut aria-hidden="true" />
              Sign Out
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
