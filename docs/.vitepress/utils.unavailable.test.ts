import { beforeEach, expect, it, vi } from 'vitest';

import { getDocsReleaseData, getLegacyUpdaterFeed, resetReleaseMetadataCache } from './utils';

// Saved metadata that fails validation must not be used either.
vi.mock('./release-snapshot.json', () => ({ default: { savedAt: '2026-01-01', releases: [], legacyUpdater: { tag: 'v0.1.5', feed: {} } } }));

beforeEach(() => {
  resetReleaseMetadataCache();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

it('falls back to a generic Releases link and writes no updater feed', async () => {
  const fetchImpl = vi.fn(async () => { throw new TypeError('fetch failed'); });

  expect(await getDocsReleaseData(fetchImpl)).toEqual({
    releasesUrl: 'https://github.com/EastSun5566/hackdesk/releases',
    stable: null,
    beta: null,
    notice: 'Release details could not be loaded. Find every download on GitHub Releases.',
  });
  expect(await getLegacyUpdaterFeed(fetchImpl)).toBeNull();
});
