import { Folder } from 'lucide-react';
import { useState } from 'react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { TeamSummary, UserSummary } from '@/lib/electron-api';
import { cn } from '@/lib/utils';

export type WorkspaceIconUser = Pick<UserSummary, 'name' | 'username' | 'photo'>;

export function PersonalWorkspaceIcon({
  user,
  className,
  testId,
}: {
  user?: WorkspaceIconUser;
  className?: string;
  testId?: string;
}) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);

  if (!user) {
    return <Folder className={cn('h-4 w-4', className)} />;
  }

  if (user.photo && user.photo !== failedPhoto) {
    return (
      <Avatar className={cn('size-6 rounded-full text-[10px] font-semibold uppercase', className)}>
        <img
          src={user.photo}
          alt=""
          width={24}
          height={24}
          className="block h-full w-full object-cover"
          data-testid={testId}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedPhoto(user.photo)}
        />
      </Avatar>
    );
  }

  return (
    <Avatar className={cn('size-6 rounded-full text-[10px] font-semibold uppercase', className)}>
      <AvatarFallback data-testid={testId}>{getUserInitials(user)}</AvatarFallback>
    </Avatar>
  );
}

export function TeamWorkspaceIcon({
  team,
  className,
  testId = `workspace-team-logo-${team.id}`,
}: {
  team: TeamSummary;
  className?: string;
  testId?: string;
}) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);

  if (team.logo && team.logo !== failedLogo) {
    return (
      <Avatar className={cn('size-6 rounded-[6px] text-[10px] font-semibold uppercase text-text-subtle', className)}>
        <img
          src={team.logo}
          alt=""
          width={24}
          height={24}
          className="block h-full w-full object-cover"
          data-testid={testId}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedLogo(team.logo)}
        />
      </Avatar>
    );
  }

  return (
    <Avatar className={cn('size-6 rounded-[6px] text-[10px] font-semibold uppercase text-text-subtle', className)}>
      <AvatarFallback data-testid={testId}>{team.name.trim().slice(0, 1) || 'T'}</AvatarFallback>
    </Avatar>
  );
}

function getUserInitials(user: WorkspaceIconUser) {
  const source = user.name.trim() || user.username.trim();
  if (!source) {
    return 'U';
  }

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
  }

  return source.slice(0, 1).toUpperCase();
}
