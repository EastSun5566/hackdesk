import type { ElectronActionId } from './electron-api';

export type ShortcutOverrides = Partial<Record<ElectronActionId, string>>;

export type ParsedShortcut = {
  key: string;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
};

export type ShortcutPlatform = 'darwin' | 'windows' | 'linux' | string;

const RESERVED_SHORTCUTS = new Set([
  'mod+a',
  'mod+c',
  'mod+d',
  'mod+q',
  'mod+v',
  'mod+x',
  'mod+z',
  'mod+shift+z',
  'mod+alt+i',
]);

const MENU_KEY_NAMES: Record<string, string> = {
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  arrowup: 'Up',
  backspace: 'Backspace',
  comma: ',',
  delete: 'Delete',
  enter: 'Enter',
  escape: 'Esc',
  minus: '-',
  plus: '+',
  space: 'Space',
  tab: 'Tab',
};

const DISPLAY_KEY_NAMES: Record<string, string> = {
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  backspace: 'Backspace',
  comma: ',',
  delete: 'Delete',
  enter: 'Enter',
  escape: 'Esc',
  minus: '-',
  plus: '+',
  space: 'Space',
  tab: 'Tab',
};

export function isMacPlatform(platform: ShortcutPlatform) {
  return platform === 'darwin' || platform.toLowerCase().includes('mac');
}

export function normalizeShortcutKey(key: string) {
  const normalized = key.trim().toLowerCase();

  switch (normalized) {
  case ' ':
  case 'spacebar':
    return 'space';
  case '+':
    return 'plus';
  case '-':
    return 'minus';
  case ',':
    return 'comma';
  case 'esc':
    return 'escape';
  case 'return':
    return 'enter';
  case 'left':
    return 'arrowleft';
  case 'right':
    return 'arrowright';
  case 'up':
    return 'arrowup';
  case 'down':
    return 'arrowdown';
  default:
    return normalized;
  }
}

export function parseShortcutConfig(config: string, platform: ShortcutPlatform): ParsedShortcut[] {
  if (!config.trim() || config.trim() === 'none') {
    return [];
  }

  return config.split(',')
    .map((combo) => parseShortcutCombo(combo, platform))
    .filter((shortcut): shortcut is ParsedShortcut => Boolean(shortcut));
}

function parseShortcutCombo(combo: string, platform: ShortcutPlatform): ParsedShortcut | null {
  const parts = combo.trim().toLowerCase().split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  const shortcut: ParsedShortcut = {
    alt: false,
    ctrl: false,
    key: '',
    meta: false,
    shift: false,
  };

  for (const part of parts) {
    switch (part) {
    case 'alt':
    case 'option':
      shortcut.alt = true;
      break;
    case 'cmd':
    case 'command':
    case 'meta':
      shortcut.meta = true;
      break;
    case 'control':
    case 'ctrl':
      shortcut.ctrl = true;
      break;
    case 'mod':
      if (isMacPlatform(platform)) {
        shortcut.meta = true;
      } else {
        shortcut.ctrl = true;
      }
      break;
    case 'shift':
      shortcut.shift = true;
      break;
    default:
      shortcut.key = normalizeShortcutKey(part);
      break;
    }
  }

  return shortcut.key ? shortcut : null;
}

export function matchShortcutConfig(config: string | undefined, event: KeyboardEvent, platform: ShortcutPlatform) {
  if (!config) {
    return false;
  }

  const eventKey = normalizeShortcutKey(event.key);
  return parseShortcutConfig(config, platform).some((shortcut) => (
    shortcut.key === eventKey
    && shortcut.alt === event.altKey
    && shortcut.ctrl === event.ctrlKey
    && shortcut.meta === event.metaKey
    && shortcut.shift === event.shiftKey
  ));
}

export function resolveActionShortcut(
  actionId: ElectronActionId,
  defaults: Partial<Record<ElectronActionId, string>>,
  overrides: ShortcutOverrides | undefined,
) {
  const override = overrides?.[actionId];
  return typeof override === 'string' ? override : defaults[actionId];
}

export function displayShortcutConfig(config: string | undefined, platform: ShortcutPlatform) {
  if (!config || config === 'none') {
    return '';
  }

  return parseShortcutConfig(config, platform)
    .map((shortcut) => displayShortcut(shortcut, platform))
    .filter(Boolean)
    .join(', ');
}

export function displayShortcut(shortcut: ParsedShortcut, platform: ShortcutPlatform) {
  const isMac = isMacPlatform(platform);
  const parts: string[] = [];

  if (shortcut.ctrl) {
    parts.push(isMac ? '⌃' : 'Ctrl');
  }
  if (shortcut.alt) {
    parts.push(isMac ? '⌥' : 'Alt');
  }
  if (shortcut.shift) {
    parts.push(isMac ? '⇧' : 'Shift');
  }
  if (shortcut.meta) {
    parts.push(isMac ? '⌘' : 'Meta');
  }

  parts.push(DISPLAY_KEY_NAMES[shortcut.key] ?? (
    shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key
  ));

  return isMac ? parts.join('') : parts.join('+');
}

export function toMenuAccelerator(config: string | undefined, platform: ShortcutPlatform) {
  const shortcut = parseShortcutConfig(config ?? '', platform)[0];
  if (!shortcut) {
    return undefined;
  }

  const parts: string[] = [];
  if (shortcut.ctrl && shortcut.meta) {
    return undefined;
  }
  if (shortcut.meta) {
    parts.push(isMacPlatform(platform) ? 'Command' : 'Super');
  }
  if (shortcut.ctrl) {
    parts.push('Ctrl');
  }
  if (shortcut.alt) {
    parts.push('Alt');
  }
  if (shortcut.shift) {
    parts.push('Shift');
  }

  const key = MENU_KEY_NAMES[shortcut.key] ?? shortcut.key.toUpperCase();
  if (!key || (parts.length === 0 && key.length === 1)) {
    return undefined;
  }

  parts.push(key);
  return parts.join('+');
}

export function recordShortcutFromEvent(event: KeyboardEvent, platform: ShortcutPlatform) {
  if (isModifierOnlyKey(event.key)) {
    return null;
  }

  const parts: string[] = [];
  const isMac = isMacPlatform(platform);
  if (isMac ? event.metaKey : event.ctrlKey) {
    parts.push('mod');
  }
  if (isMac && event.ctrlKey) {
    parts.push('ctrl');
  }
  if (!isMac && event.metaKey) {
    parts.push('meta');
  }
  if (event.altKey) {
    parts.push('alt');
  }
  if (event.shiftKey) {
    parts.push('shift');
  }

  const key = normalizeShortcutKey(event.key);
  if (!key) {
    return null;
  }

  parts.push(key);
  return parts.join('+');
}

function isModifierOnlyKey(key: string) {
  return key === 'Alt' || key === 'Control' || key === 'Meta' || key === 'Shift';
}

export function isValidCustomShortcutConfig(config: string) {
  const value = config.trim();
  if (value === 'none') {
    return true;
  }

  if (!value || value.includes(',')) {
    return false;
  }

  const shortcut = parseShortcutConfig(value, 'darwin')[0];
  if (!shortcut) {
    return false;
  }

  const hasModifier = shortcut.alt || shortcut.ctrl || shortcut.meta || shortcut.shift;
  const printableBareKey = shortcut.key.length === 1;
  if (!hasModifier && printableBareKey) {
    return false;
  }

  return !isReservedShortcutConfig(value);
}

export function isReservedShortcutConfig(config: string) {
  return RESERVED_SHORTCUTS.has(config.trim().toLowerCase());
}

export function getShortcutConflicts(
  actionId: ElectronActionId,
  candidate: string,
  current: Partial<Record<ElectronActionId, string>>,
  labels: Partial<Record<ElectronActionId, string>>,
  platform: ShortcutPlatform,
) {
  const candidateSignatures = shortcutSignatures(candidate, platform);
  if (candidateSignatures.length === 0) {
    return [];
  }

  return Object.entries(current).flatMap(([id, config]) => {
    if (id === actionId || !config) {
      return [];
    }

    const signatures = new Set(shortcutSignatures(config, platform));
    const hasConflict = candidateSignatures.some((signature) => signatures.has(signature));
    return hasConflict ? [labels[id as ElectronActionId] ?? id] : [];
  });
}

function shortcutSignatures(config: string, platform: ShortcutPlatform) {
  return parseShortcutConfig(config, platform).map((shortcut) => (
    `${shortcut.key}:${shortcut.ctrl ? 1 : 0}:${shortcut.meta ? 1 : 0}:${shortcut.shift ? 1 : 0}:${shortcut.alt ? 1 : 0}`
  ));
}
