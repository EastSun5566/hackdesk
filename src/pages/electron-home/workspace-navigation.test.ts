import { describe, expect, it } from 'vitest';

import type { TeamSummary } from '@/lib/electron-api';

import {
  getWorkspaceNavigationTeams,
  pinWorkspaceTeam,
  reorderPinnedWorkspaceTeams,
  unpinWorkspaceTeam,
} from './workspace-navigation';

function team(id: string): TeamSummary {
  return {
    id,
    ownerId: null,
    name: id,
    logo: null,
    path: id,
    description: null,
    visibility: 'private',
    createdAtMillis: null,
    upgraded: false,
  };
}

describe('workspace navigation', () => {
  const teams = [team('a'), team('b'), team('c')];

  it('treats every current team as pinned before the first customization', () => {
    expect(getWorkspaceNavigationTeams(teams, null)).toMatchObject({
      pinnedTeamIds: ['a', 'b', 'c'],
      pinnedTeams: teams,
      unpinnedTeams: [],
    });
  });

  it('keeps new teams in More after an explicit order exists', () => {
    expect(getWorkspaceNavigationTeams(teams, ['b'])).toMatchObject({
      pinnedTeamIds: ['b'],
      pinnedTeams: [teams[1]],
      unpinnedTeams: [teams[0], teams[2]],
    });
  });

  it('preserves unavailable IDs while pinning, unpinning, and reordering', () => {
    expect(pinWorkspaceTeam(teams, ['missing', 'a'], 'b')).toEqual(['missing', 'a', 'b']);
    expect(unpinWorkspaceTeam(teams, ['missing', 'a', 'b'], 'a')).toEqual(['missing', 'b']);
    expect(reorderPinnedWorkspaceTeams(['missing', 'a', 'b'], ['b', 'a'])).toEqual(['missing', 'b', 'a']);
  });
});
