import { describe, expect, it, vi } from 'vitest';

import { preferSecretServiceOnUnrecognizedDesktop } from './linux-password-store';

function commandLine(switches: string[] = []) {
  return { hasSwitch: vi.fn((name: string) => switches.includes(name)), appendSwitch: vi.fn() };
}

describe('preferSecretServiceOnUnrecognizedDesktop', () => {
  it.each([
    ['Hyprland', { XDG_CURRENT_DESKTOP: 'Hyprland' }],
    ['sway', { XDG_CURRENT_DESKTOP: 'sway', DESKTOP_SESSION: 'sway' }],
    ['niri', { XDG_CURRENT_DESKTOP: 'niri' }],
    ['no desktop variables', {}],
  ])('uses the Secret Service on %s', (_name, env) => {
    const line = commandLine();
    expect(preferSecretServiceOnUnrecognizedDesktop(line, 'linux', env)).toBe(true);
    expect(line.appendSwitch).toHaveBeenCalledWith('password-store', 'gnome-libsecret');
  });

  it.each([
    ['GNOME', { XDG_CURRENT_DESKTOP: 'GNOME' }],
    ['Ubuntu GNOME', { XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' }],
    ['Budgie on GNOME', { XDG_CURRENT_DESKTOP: 'Budgie:GNOME' }],
    ['KDE Plasma', { XDG_CURRENT_DESKTOP: 'KDE' }],
    ['a KDE session', { KDE_FULL_SESSION: 'true' }],
    ['a Plasma session name', { DESKTOP_SESSION: 'plasma' }],
    ['Cinnamon', { XDG_CURRENT_DESKTOP: 'X-Cinnamon' }],
    ['XFCE', { XDG_CURRENT_DESKTOP: 'XFCE' }],
    ['a GNOME session name', { DESKTOP_SESSION: 'gnome-xorg' }],
  ])('leaves Chromium\'s choice on %s', (_name, env) => {
    const line = commandLine();
    expect(preferSecretServiceOnUnrecognizedDesktop(line, 'linux', env)).toBe(false);
    expect(line.appendSwitch).not.toHaveBeenCalled();
  });

  it('keeps an explicit --password-store', () => {
    const line = commandLine(['password-store']);
    expect(preferSecretServiceOnUnrecognizedDesktop(line, 'linux', { XDG_CURRENT_DESKTOP: 'Hyprland' })).toBe(false);
    expect(line.appendSwitch).not.toHaveBeenCalled();
  });

  it.each(['darwin', 'win32'] as const)('does nothing on %s', (platform) => {
    const line = commandLine();
    expect(preferSecretServiceOnUnrecognizedDesktop(line, platform, {})).toBe(false);
    expect(line.appendSwitch).not.toHaveBeenCalled();
  });
});
