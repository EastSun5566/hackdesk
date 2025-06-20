export const TITLE = 'HackDesk'
export const DESCRIPTION = 'Everything you love about HackMD but in a desktop app'

export const DOCS_URL = 'https://hackdesk.eastsun.me';
export const GITHUB_AUTHOR_URL = 'https://github.com/EastSun5566';
export const REPO_URL = `${GITHUB_AUTHOR_URL}/hackdesk`;

const GA_ID = 'G-EL56FQ1YWP';
export const GA_URL = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
export const GA_SCRIPT = `
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', '${GA_ID}');
`;

export const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/eastsun5566/hackdesk/releases/latest';