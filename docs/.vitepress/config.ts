import { join } from 'path';
import { writeFile } from 'node:fs/promises';
import { defineConfig } from 'vitepress'

import { getLatestGithubRelease, getUpdaterJson } from './utils';
import { 
  TITLE,
  DESCRIPTION,
  DOCS_URL,
  GITHUB_AUTHOR_URL,
  REPO_URL,
  GA_URL,
  GA_SCRIPT
} from './constans';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: TITLE,
  description: DESCRIPTION,

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/logo.png' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: TITLE }],
    ['meta', { property: 'og:image', content: `${DOCS_URL}/logo.png` }],
    ['meta', { property: 'og:url', content: DOCS_URL }],
    ['meta', { property: 'og:description', content: DESCRIPTION }],

    // Google Analytics
    ['script', { async: 'true', src: GA_URL }],
    ['script', {}, GA_SCRIPT],
  ],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/logo.png',

    search: {
      provider: 'local'
    },

    nav: [
      { text: 'Guide', link: '/intro' }
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/intro' },
          { text: 'Installation', link: '/install' },
          { text: 'Features', link: '/features' },
          { text: 'Config', link: '/config' },
          { text: 'Issues', link: '/issues' },
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: REPO_URL }
    ],

    footer: {
      message: `Released under the <a href="${REPO_URL}/blob/main/LICENSE" target="_blank">AGPL License</a>.`,
      copyright: `Made with ❤️ By <a href="${GITHUB_AUTHOR_URL}" target="_blank">@EastSun5566</a> | The logo credit goes to <a href="https://github.com/Yukaii" target="_blank">@Yukaii</a>`
    },
  },

  lastUpdated: true,

  async buildEnd({ outDir }) {
    // write the latest release json to dist
    const updaterJson = await getUpdaterJson()
    await writeFile(join(outDir, 'latest.json'), updaterJson)
  },
})
