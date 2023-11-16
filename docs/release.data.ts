import { defineLoader } from 'vitepress';

import { GITHUB_LATEST_RELEASE_URL } from './.vitepress/constans';

interface GitHubRelease {
  version: string;
  url: string;
  assets_url: string;
  upload_url: string;
  html_url: string;
  id: number;
  author: {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    gravatar_id: string;
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: string;
    site_admin: boolean;
  };
  node_id: string;
  tag_name: string;
  target_commitish: string;
  name: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  assets: GitHubReleaseAsset[];
  tarball_url: string;
  zipball_url: string;
  body: string;
}

interface GitHubReleaseAsset {
  url: string;
  id: number;
  node_id: string;
  name: string;
  label: string;
  uploader: GitHubAuthor;
  content_type: string;
  state: string;
  size: number;
  download_count: number;
  created_at: string;
  updated_at: string;
  browser_download_url: string;
}

interface GitHubAuthor {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  site_admin: boolean;
}


declare const data: GitHubRelease;
export { data };


export default defineLoader({
  async load(): Promise<GitHubRelease> {
    const response = await fetch(GITHUB_LATEST_RELEASE_URL);
    const data = await response.json() as GitHubRelease;

    return {
      ...data,
      version: data.tag_name.split('v')[1],
    };
  },
});