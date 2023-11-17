import { GITHUB_LATEST_RELEASE_URL } from './constans';
import { GitHubRelease, UpdaterJson } from './types';

export async function getLatestGithubRelease(): Promise<GitHubRelease> {
  const response = await fetch(GITHUB_LATEST_RELEASE_URL);
  return response.json();
}

// get the signature file content
async function getSignature(url: string) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    return response.text();
  } catch (_) {
    return '';
  }
}

export function generateUpdaterJson(
  githubRelease: GitHubRelease
): UpdaterJson {
  return {
    version: githubRelease.tag_name.split('v')[1],
    notes: githubRelease.body,
    pub_date: githubRelease.published_at,
    platforms: {
      'darwin-x86_64': {
        signature: '',
        url: githubRelease.assets.find((asset) => asset.name.includes('x64.dmg'))?.browser_download_url || '',
      },
      'darwin-aarch64': {
        signature: '',
        url: githubRelease.assets.find((asset) => asset.name.includes('aarch64.dmg'))?.browser_download_url || '',
      },
      'linux-x86_64': {
        signature: '',
        url: githubRelease.assets.find((asset) => asset.name.includes('AppImage'))?.browser_download_url || '',
      },
      'windows-x86_64': {
        signature: '',
        url: githubRelease.assets.find((asset) => asset.name.includes('exe'))?.browser_download_url || '',
      },
    },
  };
}
