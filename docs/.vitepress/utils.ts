import { GITHUB_LATEST_RELEASE_URL, GITHUB_RELEASES_URL } from './constants';
import type { Asset, GitHubRelease } from './types';

const ELECTRON_RELEASE_TAG_PREFIX = 'electron-v';
const ELECTRON_UPDATER_FILES = ['latest.yml', 'latest-mac.yml', 'latest-linux.yml'] as const;

export async function getLatestGithubRelease(): Promise<GitHubRelease> {
  const response = await fetch(GITHUB_LATEST_RELEASE_URL);
  return response.json();
}

export async function getGithubReleases(): Promise<GitHubRelease[]> {
  const response = await fetch(GITHUB_RELEASES_URL);
  return response.json();
}

async function get(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    return response.text();
  } catch {
    return '';
  }
}

export async function getUpdaterJson() {
  const { assets } = await getLatestGithubRelease();
  const url = assets.find((asset) => asset.name === 'latest.json')?.browser_download_url || '';
  return await get(url);
}

export function findLatestElectronRelease(releases: GitHubRelease[]) {
  return releases.find((release) => (
    !release.draft
    && release.tag_name.startsWith(ELECTRON_RELEASE_TAG_PREFIX)
  ));
}

function getAssetByName(assets: Asset[], name: string) {
  return assets.find((asset) => asset.name === name);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function rewriteElectronUpdaterYaml(yaml: string, release: GitHubRelease) {
  let nextYaml = yaml;

  for (const asset of release.assets) {
    const escapedName = escapeRegExp(asset.name);
    nextYaml = nextYaml
      .replace(new RegExp(`(^\\s*(?:-\\s*)?url:\\s*)${escapedName}(\\s*$)`, 'gm'), `$1${asset.browser_download_url}$2`)
      .replace(new RegExp(`(^\\s*path:\\s*)${escapedName}(\\s*$)`, 'gm'), `$1${asset.browser_download_url}$2`);
  }

  return nextYaml;
}

export async function getElectronUpdaterFiles() {
  const latestElectronRelease = findLatestElectronRelease(await getGithubReleases());
  if (!latestElectronRelease) {
    return [];
  }

  const files: Array<{ name: string; content: string }> = [];
  for (const fileName of ELECTRON_UPDATER_FILES) {
    const asset = getAssetByName(latestElectronRelease.assets, fileName);
    if (!asset) {
      continue;
    }

    const content = await get(asset.browser_download_url);
    if (content) {
      files.push({
        name: fileName,
        content: rewriteElectronUpdaterYaml(content, latestElectronRelease),
      });
    }
  }

  return files;
}
