export type ShowcasePlatform = 'macos' | 'windows-linux';
export type ShowcaseMode = 'light' | 'dark';

type NavigatorLike = {
  platform?: string;
  userAgent?: string;
  userAgentData?: { platform?: string };
};

export function detectShowcasePlatform(navigatorLike?: NavigatorLike | null): ShowcasePlatform {
  if (!navigatorLike) return 'macos';
  const hint = (
    navigatorLike.userAgentData?.platform
    || navigatorLike.platform
    || navigatorLike.userAgent
    || ''
  ).toLowerCase();

  if (hint.includes('win')) return 'windows-linux';
  if ((hint.includes('linux') || hint.includes('x11') || hint.includes('cros')) && !hint.includes('android')) {
    return 'windows-linux';
  }
  return 'macos';
}

export function getShowcaseImage(platform: ShowcasePlatform, mode: ShowcaseMode, description?: string) {
  const platformLabel = platform === 'macos' ? 'macOS' : 'Windows and Linux';
  const detail = description ?? 'showing demonstration notes in split panes';
  return {
    src: `/editor-${platform}-${mode}.png`,
    alt: `HackDesk on ${platformLabel} in ${mode} mode, ${detail}`,
  };
}
