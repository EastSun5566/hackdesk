import type { TeamSummary } from '@/lib/electron-api';

/** Teams are pinned only by the user: with nothing set, every team starts under More (#421). */
function getPinnedTeamIds(configuredIds: string[] | null) {
  return configuredIds ?? [];
}

export function getWorkspaceNavigationTeams(teams: TeamSummary[], configuredIds: string[] | null) {
  const pinnedTeamIds = getPinnedTeamIds(configuredIds);
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const pinnedIdSet = new Set(pinnedTeamIds);

  return {
    pinnedTeamIds,
    pinnedTeams: pinnedTeamIds.flatMap((teamId) => {
      const team = teamsById.get(teamId);
      return team ? [team] : [];
    }),
    unpinnedTeams: teams.filter((team) => !pinnedIdSet.has(team.id)),
  };
}

export function pinWorkspaceTeam(configuredIds: string[] | null, teamId: string) {
  const pinnedTeamIds = getPinnedTeamIds(configuredIds);
  return pinnedTeamIds.includes(teamId) ? pinnedTeamIds : [...pinnedTeamIds, teamId];
}

export function unpinWorkspaceTeam(configuredIds: string[] | null, teamId: string) {
  return getPinnedTeamIds(configuredIds).filter((candidate) => candidate !== teamId);
}

export function reorderPinnedWorkspaceTeams(
  configuredIds: string[],
  visibleTeamIds: string[],
) {
  const visibleIdSet = new Set(visibleTeamIds);
  let visibleIndex = 0;

  return configuredIds.map((teamId) => {
    if (!visibleIdSet.has(teamId)) {
      return teamId;
    }

    const replacement = visibleTeamIds[visibleIndex];
    visibleIndex += 1;
    return replacement ?? teamId;
  });
}

export function getWorkspaceShortcutLabel(platform: string, index: number) {
  const isMac = platform === 'darwin' || platform.toLowerCase().includes('mac');
  return isMac ? `⌘${index}` : `Ctrl+${index}`;
}

export function getWorkspaceAriaShortcut(platform: string, index: number) {
  const isMac = platform === 'darwin' || platform.toLowerCase().includes('mac');
  return `${isMac ? 'Meta' : 'Control'}+${index}`;
}
