import type { WorkspaceScope } from './types';

export const RAIL_COLLAPSED_KEY = 'hackdesk_rail_collapsed';
export const NAVIGATOR_COLLAPSED_KEY = 'hackdesk_navigator_collapsed';
export const INSPECTOR_COLLAPSED_KEY = 'hackdesk_inspector_collapsed';
export const READER_MODE_KEY = 'hackdesk_reader_mode';
export const RAIL_WIDTH_KEY = 'hackdesk_rail_width';
export const NAVIGATOR_WIDTH_KEY = 'hackdesk_navigator_width';
export const FOLDER_COLLAPSED_PREFIX = 'hackdesk_folder_collapsed:';
export const LAST_WORKSPACE_SCOPE_KEY = 'hackdesk_last_workspace_scope';

export const RAIL_WIDTH_DEFAULT = 256;
export const RAIL_COLLAPSED_WIDTH = 64;
export const RAIL_WIDTH_MIN = 192;
export const RAIL_WIDTH_MAX = 340;
export const NAVIGATOR_WIDTH_DEFAULT = 400;
export const NAVIGATOR_WIDTH_MIN = 300;
export const NAVIGATOR_WIDTH_MAX = 560;
export const INSPECTOR_WIDTH_DEFAULT = 320;

export type ReaderMode = 'read' | 'edit';

export function clampPanelWidth(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function readBooleanStorage(key: string, fallback: boolean) {
  if (typeof window === 'undefined') {
    return fallback;
  }

  return window.localStorage.getItem(key) === null
    ? fallback
    : window.localStorage.getItem(key) === 'true';
}

export function writeBooleanStorage(key: string, value: boolean) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, String(value));
  }
}

export function readReaderModeStorage(key: string, fallback: ReaderMode): ReaderMode {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const value = window.localStorage.getItem(key);
  return value === 'read' || value === 'edit' ? value : fallback;
}

export function writeReaderModeStorage(key: string, value: ReaderMode) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, value);
  }
}

export function readNumberStorage(key: string, fallback: number, min: number, max: number) {
  if (typeof window === 'undefined') {
    return fallback;
  }

  const parsed = Number(window.localStorage.getItem(key));
  return Number.isFinite(parsed) ? clampPanelWidth(parsed, min, max) : fallback;
}

export function writeNumberStorage(key: string, value: number) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, String(Math.round(value)));
  }
}

export function readStringArrayStorage(key: string) {
  if (typeof window === 'undefined') {
    return new Set<string>();
  }

  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

export function writeStringArrayStorage(key: string, value: Set<string>) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, JSON.stringify([...value]));
  }
}

export function readWorkspaceScopeStorage(key: string, fallback: WorkspaceScope): WorkspaceScope {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? 'null') as Partial<WorkspaceScope> | null;
    if (!value || typeof value !== 'object') {
      return fallback;
    }

    if (value.type === 'personal') {
      return { type: 'personal', label: typeof value.label === 'string' && value.label ? value.label : 'My Workspace' };
    }

    if (value.type === 'history') {
      return { type: 'history', label: typeof value.label === 'string' && value.label ? value.label : 'History' };
    }

    if (value.type === 'team' && typeof value.teamPath === 'string' && value.teamPath.trim()) {
      const teamPath = value.teamPath.trim();
      return {
        type: 'team',
        label: typeof value.label === 'string' && value.label ? value.label : teamPath,
        teamPath,
      };
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export function writeWorkspaceScopeStorage(key: string, scope: WorkspaceScope) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, JSON.stringify(scope));
  }
}
