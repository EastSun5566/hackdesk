{
  const theme = localStorage.getItem('theme-mode') || localStorage.getItem('theme') || 'system';
  const presetId = localStorage.getItem('theme-preset-id') || 'hackmd-neo';
  const cachedCss = localStorage.getItem('hackdesk-theme-css');
  const resolved = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  let background = resolved === 'dark' ? '#27272A' : '#FDFDFD';
  const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');

  colorSchemeMeta?.setAttribute('content', resolved);
  if (cachedCss) {
    const style = document.createElement('style');
    style.id = 'hackdesk-theme-preload';
    style.textContent = cachedCss;
    document.head.appendChild(style);
    const backgroundMatch = cachedCss.match(/--background-default:\s*([^;]+);/);
    if (backgroundMatch) background = backgroundMatch[1].trim();
  }
  document.documentElement.classList.add(resolved);
  document.documentElement.dataset.themePreset = presetId;
  document.documentElement.style.backgroundColor = background;
  document.documentElement.style.colorScheme = resolved;
}
