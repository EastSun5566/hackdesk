import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: '/hackdesk/',
  title: "HackDesk",
  description: "📝 An unofficial HackMD desktop app",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Introduction', link: '/intro' }
    ],

    sidebar: [
      {
        // text: 'Introduction',
        items: [
          { text: 'Introduction', link: '/intro' },
          { text: 'Installation', link: '/install' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/EastSun5566/hackdesk' }
    ]
  }
})
