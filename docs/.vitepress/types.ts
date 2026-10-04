/** The validated part of a GitHub release that the docs use. */
export interface GitHubRelease {
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  assets: Array<{ name: string; browser_download_url: string }>;
}

export interface ReleaseLink {
  platform: 'macos' | 'windows' | 'linux';
  label: string;
  fileName: string;
  url: string;
}

export interface ReleaseSection {
  version: string;
  htmlUrl: string;
  links: ReleaseLink[];
}

export interface DocsReleaseData {
  releasesUrl: string;
  stable: ReleaseSection | null;
  beta: ReleaseSection | null;
  /** Set when the links did not come from a live GitHub response. */
  notice: string | null;
}

export interface ReleaseSnapshot {
  savedAt: string;
  releases: GitHubRelease[];
  legacyUpdater: { tag: string; feed: unknown };
}
