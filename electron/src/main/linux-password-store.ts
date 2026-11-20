type CommandLine = Pick<Electron.CommandLine, 'hasSwitch' | 'appendSwitch'>;

// Desktops Chromium maps to a keyring backend (libsecret or KWallet) on its own. On any other
// desktop, such as Hyprland, Sway or niri, it picks the plain-text `basic_text` store, which
// token-storage.ts refuses, so HackMD tokens could not be saved even with a running keyring.
const KEYRING_DESKTOPS = ['gnome', 'kde', 'plasma', 'unity', 'x-cinnamon', 'cinnamon', 'pantheon', 'xfce', 'ukui', 'deepin'];

function hasKeyringDesktop(env: NodeJS.ProcessEnv) {
  if (env.KDE_FULL_SESSION || env.GNOME_DESKTOP_SESSION_ID) return true;
  const desktops = [...(env.XDG_CURRENT_DESKTOP ?? '').split(':'), env.DESKTOP_SESSION ?? '']
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return desktops.some((name) => KEYRING_DESKTOPS.some((desktop) => name.startsWith(desktop)));
}

/**
 * Use the Secret Service (gnome-keyring, KeePassXC, KWallet 6 and others) on Linux desktops that
 * Chromium does not recognise. Must run before the app is ready. Without a Secret Service the
 * backend reports encryption as unavailable, the same outcome as `basic_text`.
 */
export function preferSecretServiceOnUnrecognizedDesktop(
  commandLine: CommandLine,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (platform !== 'linux' || commandLine.hasSwitch('password-store') || hasKeyringDesktop(env)) return false;
  commandLine.appendSwitch('password-store', 'gnome-libsecret');
  return true;
}
