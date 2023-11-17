import { defineLoader } from 'vitepress';

import { getLatestGithubRelease } from './.vitepress/utils';
import { GitHubRelease } from './.vitepress/types';


declare const data: GitHubRelease;
export { data };


export default defineLoader({
  async load(): Promise<GitHubRelease> {
    const data = await getLatestGithubRelease();

    return {
      ...data,
      version: data.tag_name.split('v')[1],
    };
  },
});