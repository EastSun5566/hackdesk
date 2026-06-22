import { describe, expect, it } from 'vitest';

import { findLatestElectronRelease, rewriteElectronUpdaterYaml } from './utils';
import type { GitHubRelease } from './types';

function createRelease(tagName: string, assets: Array<{ name: string; browser_download_url: string }> = []): GitHubRelease {
  return {
    url: '',
    assets_url: '',
    upload_url: '',
    html_url: '',
    id: 1,
    author: {
      login: '',
      id: 1,
      node_id: '',
      avatar_url: '',
      gravatar_id: '',
      url: '',
      html_url: '',
      followers_url: '',
      following_url: '',
      gists_url: '',
      starred_url: '',
      subscriptions_url: '',
      organizations_url: '',
      repos_url: '',
      events_url: '',
      received_events_url: '',
      type: 'User',
      site_admin: false,
    },
    node_id: '',
    tag_name: tagName,
    target_commitish: 'main',
    name: tagName,
    draft: false,
    prerelease: true,
    created_at: '',
    published_at: '',
    assets: assets.map((asset, index) => ({
      url: '',
      id: index + 1,
      node_id: '',
      name: asset.name,
      label: '',
      uploader: {
        login: '',
        id: 1,
        node_id: '',
        avatar_url: '',
        gravatar_id: '',
        url: '',
        html_url: '',
        followers_url: '',
        following_url: '',
        gists_url: '',
        starred_url: '',
        subscriptions_url: '',
        organizations_url: '',
        repos_url: '',
        events_url: '',
        received_events_url: '',
        type: 'User',
        site_admin: false,
      },
      content_type: 'application/octet-stream',
      state: 'uploaded',
      size: 1,
      download_count: 0,
      created_at: '',
      updated_at: '',
      browser_download_url: asset.browser_download_url,
    })),
    tarball_url: '',
    zipball_url: '',
    body: '',
  };
}

describe('Electron updater docs feed helpers', () => {
  it('selects the latest non-draft electron release from GitHub release order', () => {
    const draftRelease = createRelease('electron-v0.3.0');
    draftRelease.draft = true;

    expect(findLatestElectronRelease([
      createRelease('v0.3.0'),
      draftRelease,
      createRelease('electron-v0.2.0'),
    ])?.tag_name).toBe('electron-v0.2.0');
  });

  it('rewrites updater yaml file references to absolute GitHub asset URLs', () => {
    const release = createRelease('electron-v0.2.0', [
      {
        name: 'HackDesk-0.2.0-arm64-mac.zip',
        browser_download_url: 'https://github.com/EastSun5566/hackdesk/releases/download/electron-v0.2.0/HackDesk-0.2.0-arm64-mac.zip',
      },
      {
        name: 'HackDesk-0.2.0-arm64-mac.zip.blockmap',
        browser_download_url: 'https://github.com/EastSun5566/hackdesk/releases/download/electron-v0.2.0/HackDesk-0.2.0-arm64-mac.zip.blockmap',
      },
    ]);

    expect(rewriteElectronUpdaterYaml([
      'version: 0.2.0',
      'files:',
      '  - url: HackDesk-0.2.0-arm64-mac.zip',
      '    sha512: abc',
      'path: HackDesk-0.2.0-arm64-mac.zip',
      'sha512: abc',
      '',
    ].join('\n'), release)).toContain(
      'url: https://github.com/EastSun5566/hackdesk/releases/download/electron-v0.2.0/HackDesk-0.2.0-arm64-mac.zip',
    );
  });
});
