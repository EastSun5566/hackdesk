import { defineConfig } from 'vitepress'

const title = 'HackDesk'
const description = 'Everything you love about HackMD but in a desktop app'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title,
  description,

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/logo.png' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: title }],
    ['meta', { property: 'og:image', content: 'https://hackdesk.vercel.app/logo.png' }],
    ['meta', { property: 'og:url', content: 'https://hackdesk.vercel.app' }],
    ['meta', { property: 'og:description', content: description }],
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
          { text: 'Known Issues', link: '/issues' },
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
})
