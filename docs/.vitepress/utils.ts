import { GITHUB_RELEASES_API_URL, RELEASES_URL } from './constants.ts';
import savedSnapshot from './release-snapshot.json' with { type: 'json' };
import type { DocsReleaseData, GitHubRelease, ReleaseLink, ReleaseSection, ReleaseSnapshot } from './types.ts';

type Fetch = typeof fetch;
type Version = { core: [number, number, number]; beta: number | null };

const DOWNLOAD_URL = `${RELEASES_URL}/download/`;
const RELEASES_PER_PAGE = 100;
const MAX_RELEASE_PAGES = 5;
const LEGACY_UPDATER_ASSET = 'latest.json';

// Matches both v0.1.x (`HackDesk_0.1.5_x64-setup.exe`) and v2 (`HackDesk-2.0.0-x64.exe`) names.
const PLATFORM_ASSETS: Array<Omit<ReleaseLink, 'fileName' | 'url'> & { suffix: RegExp }> = [
  { platform: 'macos', label: 'macOS · Apple silicon', suffix: /[-_](?:arm64|aarch64)\.dmg$/ },
  { platform: 'macos', label: 'macOS · Intel', suffix: /[-_]x64\.dmg$/ },
  { platform: 'windows', label: 'Windows · x64', suffix: /[-_]x64(?:-setup)?\.exe$/ },
  { platform: 'linux', label: 'Linux · x64 AppImage', suffix: /[-_](?:x86_64|amd64)\.AppImage$/ },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Validates a GitHub releases response, so an error or rate-limit body is never read as releases. */
export function parseReleases(value: unknown): GitHubRelease[] {
  if (!Array.isArray(value)) throw new Error('GitHub releases response is not a list.');
  return value.map((release) => {
    if (
      !isRecord(release) || typeof release.tag_name !== 'string' || typeof release.html_url !== 'string'
      || typeof release.draft !== 'boolean' || typeof release.prerelease !== 'boolean' || !Array.isArray(release.assets)
    ) {
      throw new Error('GitHub releases response has an unexpected shape.');
    }
    const downloadPrefix = `${DOWNLOAD_URL}${release.tag_name}/`;
    const assets = release.assets.map((asset) => {
      if (
        !isRecord(asset) || typeof asset.name !== 'string' || typeof asset.browser_download_url !== 'string'
        || !asset.browser_download_url.startsWith(downloadPrefix)
      ) {
        throw new Error(`GitHub release ${release.tag_name} has an unexpected asset.`);
      }
      return { name: asset.name, browser_download_url: asset.browser_download_url };
    });
    return {
      tag_name: release.tag_name,
      html_url: release.html_url,
      draft: release.draft,
      prerelease: release.prerelease,
      assets,
    };
  });
}

export async function fetchReleases(fetchImpl: Fetch = fetch): Promise<GitHubRelease[]> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const releases: GitHubRelease[] = [];
  for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
    const response = await fetchImpl(`${GITHUB_RELEASES_API_URL}?per_page=${RELEASES_PER_PAGE}&page=${page}`, { headers });
    if (!response.ok) throw new Error(`GitHub releases request failed with HTTP ${response.status}.`);
    const batch = parseReleases(await response.json());
    releases.push(...batch);
    if (batch.length < RELEASES_PER_PAGE) break;
  }
  return releases;
}

/** Stable (`v1.2.3`) and beta (`v1.2.3-beta.4`) tags; main previews and old tag schemes return null. */
export function parseVersionTag(tag: string): Version | null {
  const match = /^v(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(tag);
  if (!match) return null;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    beta: match[4] === undefined ? null : Number(match[4]),
  };
}

function compareVersions(left: Version, right: Version) {
  for (let index = 0; index < 3; index += 1) {
    const difference = left.core[index] - right.core[index];
    if (difference) return difference;
  }
  if (left.beta === right.beta) return 0;
  if (left.beta === null) return 1;
  if (right.beta === null) return -1;
  return left.beta - right.beta;
}

function newestRelease(releases: GitHubRelease[], channel: 'stable' | 'beta', predicate = (_release: GitHubRelease) => true) {
  let newest: { release: GitHubRelease; version: Version } | null = null;
  for (const release of releases) {
    const version = parseVersionTag(release.tag_name);
    if (!version || release.draft || !predicate(release)) continue;
    const isBeta = version.beta !== null;
    // A tag and its prerelease flag must agree before it is offered as either channel.
    if ((channel === 'beta') !== isBeta || release.prerelease !== isBeta) continue;
    if (!newest || compareVersions(version, newest.version) > 0) newest = { release, version };
  }
  return newest;
}

/** Links only to installers that the release actually published. */
export function getReleaseLinks(release: GitHubRelease): ReleaseLink[] {
  const version = release.tag_name.slice(1);
  const ownAssets = release.assets.filter(({ name }) => (
    name.startsWith(`HackDesk-${version}-`) || name.startsWith(`HackDesk_${version}_`)
  ));
  return PLATFORM_ASSETS.flatMap(({ suffix, ...platform }) => {
    const asset = ownAssets.find(({ name }) => suffix.test(name));
    return asset ? [{ ...platform, fileName: asset.name, url: asset.browser_download_url }] : [];
  });
}

function toSection(release: GitHubRelease | undefined): ReleaseSection | null {
  if (!release) return null;
  const links = getReleaseLinks(release);
  return links.length ? { version: release.tag_name.slice(1), htmlUrl: release.html_url, links } : null;
}

export function buildDocsReleaseData(releases: GitHubRelease[], notice: string | null = null): DocsReleaseData {
  const stable = newestRelease(releases, 'stable');
  const beta = newestRelease(releases, 'beta');
  // A beta is only worth offering while it is newer than the stable release.
  const currentBeta = beta && (!stable || compareVersions(beta.version, stable.version) > 0) ? beta : null;
  return {
    releasesUrl: RELEASES_URL,
    stable: toSection(stable?.release),
    beta: toSection(currentBeta?.release),
    notice,
  };
}

/** Validates a v0.1.x (Tauri) updater feed for the release it belongs to. */
export function parseLegacyUpdaterFeed(value: unknown, release: GitHubRelease) {
  const platforms = isRecord(value) && isRecord(value.platforms) ? Object.values(value.platforms) : [];
  const downloadPrefix = `${DOWNLOAD_URL}${release.tag_name}/`;
  const valid = isRecord(value)
    && value.version === release.tag_name.slice(1)
    && platforms.length > 0
    && platforms.every((platform) => (
      isRecord(platform) && typeof platform.signature === 'string' && platform.signature.length > 0
      && typeof platform.url === 'string' && platform.url.startsWith(downloadPrefix)
    ));
  if (!valid) throw new Error(`Updater feed for ${release.tag_name} is not valid.`);
  return value;
}

/** v0.1.x clients read `latest.json`; v2 publishes `*.yml` feeds, so v2 releases are never picked here. */
export function findLegacyUpdaterRelease(releases: GitHubRelease[]) {
  return newestRelease(releases, 'stable', (release) => (
    release.assets.some(({ name }) => name === LEGACY_UPDATER_ASSET)
  ))?.release ?? null;
}

export function parseReleaseSnapshot(value: unknown): ReleaseSnapshot {
  if (!isRecord(value) || typeof value.savedAt !== 'string' || !isRecord(value.legacyUpdater)) {
    throw new Error('Saved release metadata has an unexpected shape.');
  }
  const releases = parseReleases(value.releases);
  const { tag, feed } = value.legacyUpdater;
  const release = releases.find(({ tag_name }) => tag_name === tag);
  if (!release) throw new Error('Saved release metadata has no release for its updater feed.');
  return { savedAt: value.savedAt, releases, legacyUpdater: { tag: release.tag_name, feed: parseLegacyUpdaterFeed(feed, release) } };
}

async function fetchLegacyUpdaterFeed(release: GitHubRelease, fetchImpl: Fetch) {
  const asset = release.assets.find(({ name }) => name === LEGACY_UPDATER_ASSET)!;
  const response = await fetchImpl(asset.browser_download_url);
  if (!response.ok) throw new Error(`Updater feed request failed with HTTP ${response.status}.`);
  return parseLegacyUpdaterFeed(await response.json(), release);
}

type ReleaseMetadata = { releases: GitHubRelease[]; savedAt: string | null };
const METADATA_KEY = Symbol.for('hackdesk.docs.releaseMetadata');

function readSavedSnapshot() {
  try {
    return parseReleaseSnapshot(savedSnapshot);
  } catch (error) {
    console.warn(`[docs] Saved release metadata is not usable: ${errorMessage(error)}`);
    return null;
  }
}

/** Fetches releases once per build; the page loader and `buildEnd` may load this module separately. */
export function loadReleaseMetadata(fetchImpl: Fetch = fetch): Promise<ReleaseMetadata | null> {
  const cache = globalThis as typeof globalThis & { [METADATA_KEY]?: Promise<ReleaseMetadata | null> };
  cache[METADATA_KEY] ??= fetchReleases(fetchImpl)
    .then((releases): ReleaseMetadata => ({ releases, savedAt: null }))
    .catch((error) => {
      console.warn(`[docs] Could not load GitHub releases: ${errorMessage(error)} Using saved release metadata.`);
      const snapshot = readSavedSnapshot();
      return snapshot ? { releases: snapshot.releases, savedAt: snapshot.savedAt } : null;
    });
  return cache[METADATA_KEY];
}

export function resetReleaseMetadataCache() {
  delete (globalThis as Record<symbol, unknown>)[METADATA_KEY];
}

export async function getDocsReleaseData(fetchImpl: Fetch = fetch): Promise<DocsReleaseData> {
  const metadata = await loadReleaseMetadata(fetchImpl);
  if (!metadata) {
    return {
      releasesUrl: RELEASES_URL,
      stable: null,
      beta: null,
      notice: 'Release details could not be loaded. Find every download on GitHub Releases.',
    };
  }
  const notice = metadata.savedAt
    ? `These links come from release details saved on ${metadata.savedAt.slice(0, 10)}. GitHub Releases may have newer downloads.`
    : null;
  return buildDocsReleaseData(metadata.releases, notice);
}

/**
 * Returns the `latest.json` for v0.1.x clients, or null when no validated feed
 * is available. It is never empty or derived from anything but a published feed.
 */
export async function getLegacyUpdaterFeed(fetchImpl: Fetch = fetch): Promise<string | null> {
  const metadata = await loadReleaseMetadata(fetchImpl);
  const release = metadata && !metadata.savedAt ? findLegacyUpdaterRelease(metadata.releases) : null;
  if (release) {
    try {
      return `${JSON.stringify(await fetchLegacyUpdaterFeed(release, fetchImpl), null, 2)}\n`;
    } catch (error) {
      console.warn(`[docs] Could not load the ${release.tag_name} updater feed: ${errorMessage(error)}`);
    }
  }
  const snapshot = readSavedSnapshot();
  return snapshot ? `${JSON.stringify(snapshot.legacyUpdater.feed, null, 2)}\n` : null;
}

/** Builds the saved metadata from live GitHub data; fails instead of saving anything unverified. */
export async function createReleaseSnapshot(fetchImpl: Fetch = fetch): Promise<ReleaseSnapshot> {
  const releases = (await fetchReleases(fetchImpl)).filter(({ tag_name }) => parseVersionTag(tag_name));
  const legacyRelease = findLegacyUpdaterRelease(releases);
  if (!legacyRelease) throw new Error('No stable release publishes a legacy updater feed.');
  const feed = await fetchLegacyUpdaterFeed(legacyRelease, fetchImpl);
  return parseReleaseSnapshot({ savedAt: new Date().toISOString(), releases, legacyUpdater: { tag: legacyRelease.tag_name, feed } });
}
