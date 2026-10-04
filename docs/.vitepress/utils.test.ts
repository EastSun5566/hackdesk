import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildDocsReleaseData,
  fetchReleases,
  findLegacyUpdaterRelease,
  getDocsReleaseData,
  getLegacyUpdaterFeed,
  parseLegacyUpdaterFeed,
  parseReleases,
  resetReleaseMetadataCache,
} from './utils';
import type { GitHubRelease } from './types';

const DOWNLOAD = 'https://github.com/EastSun5566/hackdesk/releases/download';

function release(tag: string, names: string[], { prerelease = tag.includes('-'), draft = false } = {}): GitHubRelease {
  return {
    tag_name: tag,
    html_url: `https://github.com/EastSun5566/hackdesk/releases/tag/${tag}`,
    draft,
    prerelease,
    assets: names.map((name) => ({ name, browser_download_url: `${DOWNLOAD}/${tag}/${name}` })),
  };
}

const v015 = release('v0.1.5', [
  'HackDesk_0.1.5_aarch64.dmg', 'HackDesk_0.1.5_x64.dmg', 'HackDesk_0.1.5_x64-setup.exe', 'HackDesk_0.1.5_x64_en-US.msi',
  'HackDesk_0.1.5_amd64.AppImage', 'HackDesk_0.1.5_amd64.AppImage.sig', 'HackDesk_0.1.5_amd64.deb', 'latest.json',
]);
const electronAssets = (version: string, feed: string) => [
  `HackDesk-${version}-arm64.dmg`, `HackDesk-${version}-x64.dmg`, `HackDesk-${version}-x64.exe`,
  `HackDesk-${version}-x64.exe.blockmap`, `HackDesk-${version}-x86_64.AppImage`, `${feed}.yml`, `${feed}-mac.yml`,
];
const beta4 = release('v2.0.0-beta.4', electronAssets('2.0.0-beta.4', 'beta'));
const mainPreview = release('main-59dc557', electronAssets('2.0.0-beta.main.g59dc557', 'main'));
const legacyFeed = {
  version: '0.1.5',
  notes: 'Fixes',
  pub_date: '2026-05-27T18:38:31.692Z',
  platforms: { 'darwin-aarch64': { signature: 'sig', url: `${DOWNLOAD}/v0.1.5/HackDesk_aarch64.app.tar.gz` } },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function mockFetch(routes: Record<string, () => Response>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const route = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!route) throw new TypeError(`fetch failed: ${url}`);
    return routes[route]();
  });
}

const RELEASES_API = 'https://api.github.com/repos/EastSun5566/hackdesk/releases';

beforeEach(() => {
  resetReleaseMetadataCache();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('parseReleases', () => {
  it('rejects error and rate-limit bodies instead of reading them as releases', () => {
    expect(() => parseReleases({ message: 'API rate limit exceeded' })).toThrow('not a list');
    expect(() => parseReleases([{ message: 'Not Found' }])).toThrow('unexpected shape');
  });

  it('rejects a download URL outside the release', () => {
    const tampered = release('v0.1.5', ['latest.json']);
    tampered.assets[0].browser_download_url = 'https://example.com/latest.json';
    expect(() => parseReleases([tampered])).toThrow('unexpected asset');
  });
});

describe('fetchReleases', () => {
  it('reports a failed response with its status', async () => {
    const fetchImpl = mockFetch({ [RELEASES_API]: () => jsonResponse({ message: 'API rate limit exceeded' }, 403) });
    await expect(fetchReleases(fetchImpl)).rejects.toThrow('HTTP 403');
  });

  it('reads every page until a short page', async () => {
    const page = Array.from({ length: 100 }, (_, index) => release(`main-${index}`, []));
    const fetchImpl = vi.fn(async (input: string | URL | Request) => (
      jsonResponse(new URL(String(input)).searchParams.get('page') === '1' ? page : [v015])
    ));
    expect(await fetchReleases(fetchImpl)).toHaveLength(101);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('buildDocsReleaseData', () => {
  it('links the stable and beta installers that were actually published, ignoring previews and drafts', () => {
    const data = buildDocsReleaseData([
      mainPreview,
      release('v2.0.0-beta.5', electronAssets('2.0.0-beta.5', 'beta'), { draft: true }),
      beta4,
      v015,
    ]);

    expect(data.stable?.version).toBe('0.1.5');
    expect(data.stable?.links.map(({ label, fileName }) => [label, fileName])).toEqual([
      ['macOS · Apple silicon', 'HackDesk_0.1.5_aarch64.dmg'],
      ['macOS · Intel', 'HackDesk_0.1.5_x64.dmg'],
      ['Windows · x64', 'HackDesk_0.1.5_x64-setup.exe'],
      ['Linux · x64 AppImage', 'HackDesk_0.1.5_amd64.AppImage'],
    ]);
    expect(data.beta?.version).toBe('2.0.0-beta.4');
    expect(data.beta?.links.map(({ url }) => url)).toEqual([
      `${DOWNLOAD}/v2.0.0-beta.4/HackDesk-2.0.0-beta.4-arm64.dmg`,
      `${DOWNLOAD}/v2.0.0-beta.4/HackDesk-2.0.0-beta.4-x64.dmg`,
      `${DOWNLOAD}/v2.0.0-beta.4/HackDesk-2.0.0-beta.4-x64.exe`,
      `${DOWNLOAD}/v2.0.0-beta.4/HackDesk-2.0.0-beta.4-x86_64.AppImage`,
    ]);
    expect(data.notice).toBeNull();
  });

  it('omits a platform whose installer is missing', () => {
    const partial = release('v2.0.0-beta.4', ['HackDesk-2.0.0-beta.4-arm64.dmg', 'HackDesk-2.0.1-x64.exe']);
    expect(buildDocsReleaseData([partial, v015]).beta?.links.map(({ label }) => label)).toEqual(['macOS · Apple silicon']);
  });

  it('switches to a future v2 stable release and hides older betas', () => {
    const v2 = release('v2.0.0', [...electronAssets('2.0.0', 'latest'), 'latest-linux.yml']);
    const data = buildDocsReleaseData([v2, beta4, v015]);

    expect(data.stable?.version).toBe('2.0.0');
    expect(data.stable?.links.map(({ fileName }) => fileName)).toContain('HackDesk-2.0.0-x64.exe');
    expect(data.beta).toBeNull();
    // v0.1.x clients keep reading the last release that publishes their feed.
    expect(findLegacyUpdaterRelease([v2, beta4, v015])?.tag_name).toBe('v0.1.5');
  });

  it('does not offer a tag whose prerelease flag disagrees with its channel', () => {
    const data = buildDocsReleaseData([release('v2.1.0', electronAssets('2.1.0', 'latest'), { prerelease: true }), v015]);
    expect(data.stable?.version).toBe('0.1.5');
  });
});

describe('getDocsReleaseData', () => {
  it('uses saved metadata with a notice when GitHub is unavailable, fetching once per build', async () => {
    const fetchImpl = mockFetch({ [RELEASES_API]: () => jsonResponse({ message: 'API rate limit exceeded' }, 403) });

    const data = await getDocsReleaseData(fetchImpl);
    await getLegacyUpdaterFeed(fetchImpl);

    expect(data.notice).toMatch(/^These links come from release details saved on \d{4}-\d{2}-\d{2}\./);
    expect(data.stable?.links.length).toBeGreaterThan(0);
    expect(data.beta?.links.length).toBeGreaterThan(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('legacy updater feed', () => {
  it('rejects empty or mismatched feeds', () => {
    expect(() => parseLegacyUpdaterFeed('', v015)).toThrow('not valid');
    expect(() => parseLegacyUpdaterFeed({ ...legacyFeed, version: '0.1.4' }, v015)).toThrow('not valid');
    expect(() => parseLegacyUpdaterFeed({ ...legacyFeed, platforms: {} }, v015)).toThrow('not valid');
    expect(() => parseLegacyUpdaterFeed({
      ...legacyFeed,
      platforms: { 'darwin-aarch64': { signature: 'sig', url: 'https://example.com/app.tar.gz' } },
    }, v015)).toThrow('not valid');
  });

  it('publishes the validated feed of the newest v0.1.x release', async () => {
    const fetchImpl = mockFetch({
      [RELEASES_API]: () => jsonResponse([mainPreview, beta4, v015]),
      [`${DOWNLOAD}/v0.1.5/latest.json`]: () => jsonResponse(legacyFeed),
    });
    expect(JSON.parse((await getLegacyUpdaterFeed(fetchImpl))!)).toEqual(legacyFeed);
  });

  it('falls back to the saved feed instead of publishing an empty one', async () => {
    const fetchImpl = mockFetch({
      [RELEASES_API]: () => jsonResponse([v015]),
      [`${DOWNLOAD}/v0.1.5/latest.json`]: () => new Response('', { status: 502 }),
    });
    const feed = await getLegacyUpdaterFeed(fetchImpl);
    expect(feed).toBeTruthy();
    expect(JSON.parse(feed!)).toMatchObject({ version: '0.1.5' });
  });
});
