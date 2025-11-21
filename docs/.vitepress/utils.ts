import { GITHUB_LATEST_RELEASE_URL } from './constans';
import type { GitHubRelease } from './types';

export async function getLatestGithubRelease(): Promise<GitHubRelease> {
  const response = await fetch(GITHUB_LATEST_RELEASE_URL);
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