import { join } from 'path';
import { writeFile } from 'node:fs/promises';
import { defineConfig } from 'vitepress';
import llmstxt from 'vitepress-plugin-llms';

import { getLegacyUpdaterFeed } from './utils.ts';
import { 
  TITLE,
  DESCRIPTION,
  DOCS_URL,
  GITHUB_AUTHOR_URL,
  REPO_URL,
  GA_URL,
  GA_SCRIPT,
} from './constants';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: TITLE,
  description: DESCRIPTION,

  vite: {
    plugins: [llmstxt({
      domain: DOCS_URL,
      title: TITLE,
      description: DESCRIPTION,
      details: `For installation, start with [Install with an agent](${DOCS_URL}/install-agent.md). Use the official GitHub Releases listing for current downloads.`,
      injectLLMHint: false,
    })],
  },

  cleanUrls: true,

  sitemap: {
    hostname: DOCS_URL,
  },

  head: [
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon.png' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
    ['meta', { name: 'color-scheme', content: 'light dark' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: TITLE }],
    ['meta', { property: 'og:image', content: `${DOCS_URL}/logo.png` }],
    ['meta', { property: 'og:image:width', content: '512' }],
    ['meta', { property: 'og:image:height', content: '512' }],
    ['meta', { property: 'og:image:alt', content: 'HackDesk app icon' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],

    // Google Analytics
    ['script', { async: 'true', src: GA_URL }],
    ['script', {}, GA_SCRIPT],
  ],

  // Per-page canonical URL and social metadata; site-wide tags stay in `head`.
  transformPageData(pageData) {
    const path = pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '');
    const url = `${DOCS_URL}/${path}`;
    const isHome = pageData.frontmatter.layout === 'home';
    const title = isHome ? `${TITLE} | ${DESCRIPTION}` : `${pageData.title} | ${TITLE}`;
    const description = pageData.description || DESCRIPTION;

    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.push(
      ['link', { rel: 'canonical', href: url }],
      ['meta', { property: 'og:url', content: url }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
    );

    if (isHome) {
      pageData.frontmatter.head.push(['script', { type: 'application/ld+json' }, JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: TITLE,
        url: `${DOCS_URL}/`,
      })]);
    }
  },

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: { light: '/logo.png', dark: '/logo-dark.png' },

    search: {
      provider: 'local',
    },

    nav: [
      { text: 'Get started', link: '/intro' },
      { text: 'Blog', link: 'https://hackmd.io/@hackdesk' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Get started', link: '/intro' },
          { text: 'Install HackDesk', link: '/install' },
          { text: 'Install with an agent', link: '/install-agent' },
          { text: 'Work with notes', link: '/features' },
          { text: 'Quick Hack', link: '/quick-hack' },
          { text: 'Keyboard navigation', link: '/keyboard-navigation' },
          { text: 'Customize HackDesk', link: '/config' },
          { text: 'Code signing policy', link: '/code-signing-policy' },
          { text: 'GitHub Issues', link: `${REPO_URL}/issues` },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: REPO_URL },
    ],

    footer: {
      message: `Released under the <a href="${REPO_URL}/blob/main/LICENSE" target="_blank">AGPL License</a>.`,
      copyright: `Made with ❤️ By <a href="${GITHUB_AUTHOR_URL}" target="_blank">@EastSun5566</a> | The logo credit goes to <a href="https://github.com/Yukaii" target="_blank">@Yukaii</a>`,
    },
  },

  lastUpdated: true,

  async buildEnd({ outDir }) {
    // v0.1.x clients poll this feed. v2 updates come from GitHub Releases directly.
    const feed = await getLegacyUpdaterFeed();
    if (feed) {
      await writeFile(join(outDir, 'latest.json'), feed);
    } else {
      console.warn('[docs] No validated legacy updater feed; latest.json was not written.');
    }
  },
});
