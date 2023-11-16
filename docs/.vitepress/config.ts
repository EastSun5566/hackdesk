import { join } from 'path';
import { writeFile } from 'node:fs/promises';
import { defineConfig } from 'vitepress'

import { GITHUB_LATEST_RELEASE_URL } from './constans';

const TITLE = 'HackDesk'
const DESCRIPTION = 'Everything you love about HackMD but in a desktop app'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: TITLE,
  description: DESCRIPTION,

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/logo.png' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: TITLE }],
    ['meta', { property: 'og:image', content: 'https://hackdesk.vercel.app/logo.png' }],
    ['meta', { property: 'og:url', content: 'https://hackdesk.vercel.app' }],
    ['meta', { property: 'og:description', content: DESCRIPTION }],

    // Google Analytics
    ['script', { async: 'true', src: 'https://www.googletagmanager.com/gtag/js?id=G-EL56FQ1YWP' }],
    ['script', {}, `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', 'G-EL56FQ1YWP');
    `],
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
      { icon: 'github', link: 'https://github.com/EastSun5566/hackdesk' }
    ],

    footer: {
      message: 'Released under the <a href="https://github.com/EastSun5566/hackdesk/blob/main/LICENSE" target="_blank">AGPL License</a>.',
      copyright: 'Made with ❤️ By <a href="https://github.com/EastSun5566" target="_blank">@EastSun5566</a> | The logo credit goes to <a href="https://github.com/Yukaii" target="_blank">@Yukaii</a>'
    },
  },

  lastUpdated: true,

  async buildEnd({ outDir }) {
    // write the latest release json to dist
    const json = await (await fetch(GITHUB_LATEST_RELEASE_URL)).json()
    await writeFile(join(outDir, 'release.json'), JSON.stringify(json))
  },
})
