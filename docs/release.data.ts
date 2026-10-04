import { defineLoader } from 'vitepress';

import { getDocsReleaseData } from './.vitepress/utils.ts';
import type { DocsReleaseData } from './.vitepress/types.ts';

declare const data: DocsReleaseData;
export { data };

export default defineLoader({
  load: () => getDocsReleaseData(),
});
