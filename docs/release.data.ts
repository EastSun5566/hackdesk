import { defineLoader } from 'vitepress';

import { getLatestGithubRelease } from './.vitepress/utils';
import type { DocsReleaseData } from './.vitepress/types';


function getReleaseVersion(tagName: string): string {
  if (tagName.startsWith('hackdesk-v')) {
    return tagName.slice('hackdesk-v'.length);
  }

  if (tagName.startsWith('v')) {
    return tagName.slice(1);
  }

  return tagName;
}

declare const data: DocsReleaseData;
export { data };


export default defineLoader({
  async load(): Promise<DocsReleaseData> {
    const data = await getLatestGithubRelease();

    return {
      ...data,
      version: getReleaseVersion(data.tag_name),
      releaseTag: data.tag_name,
      releaseDownloadBaseUrl: `https://github.com/EastSun5566/hackdesk/releases/download/${data.tag_name}`,
    };
  },
});
