import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "HackDesk",
  description: "📝 An unofficial HackMD desktop app",
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
          { text: 'Features', link: '/features' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/EastSun5566/hackdesk' }
    ],

    footer: {
      message: 'Released under the <a href="https://github.com/EastSun5566/hackdesk/blob/main/LICENSE" target="_blank">AGPL License</a>.',
      copyright: 'Made with ❤️ By <a href="https://github.com/EastSun5566" target="_blank">@EastSun5566</a> | The logo credit goes to <a href="https://github.com/EastSun5566" target="_blank">@Yukaii</a>'
    }
  }
})
