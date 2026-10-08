import { readEditorNavigationKeymap } from '@/lib/editor-navigation-keymap';
import { ELECTRON_ACTIONS, getResolvedActionShortcut, resolveWorkbenchShortcut } from '@/lib/electron-actions';
import type { ElectronActionId } from '@/lib/electron-api';
import { isMacPlatform, parseShortcutConfig, type ShortcutOverrides } from '@/lib/keyboard-shortcuts';
import { hasWorkbenchPopup } from './workbench-keyboard-context';

export type NavigationTarget = { id: string; element: HTMLElement; activate: boolean; shortcut?: string };
export type NavigationHint = NavigationTarget & { code: string; rect: DOMRect };
const ALPHABET = 'asdfghjklqwertyuiopzxcvbnm';
// Native edit/window/application roles and common OS shortcuts, independent of user overrides.
const NATIVE_LETTERS = 'acvxyzfhmpqw';
const TARGET_SELECTOR = '[data-workspace-navigation-id], [role="tab"][data-navigation-tab-id], [role="treeitem"], input[name="noteSearch"], [data-hackdesk-focus="editor"], [data-hackdesk-focus="editor"] .cm-content, [data-navigation-toolbar]';

export function navigationRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  let left = Math.max(0, rect.left), top = Math.max(0, rect.top);
  let right = Math.min(window.innerWidth, rect.right), bottom = Math.min(window.innerHeight, rect.bottom);
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const bounds = parent.getBoundingClientRect();
    if (/(hidden|clip|auto|scroll)/.test(style.overflowY || style.overflow)) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
    if (/(hidden|clip|auto|scroll)/.test(style.overflowX || style.overflow)) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
  }
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

export function isNavigationVisible(element: HTMLElement) {
  if (!element.isConnected || element.closest('[hidden], [inert], [aria-hidden="true"], [data-closed]') || element.matches(':disabled, [aria-disabled="true"]')) return false;
  const rect = navigationRect(element);
  if (rect.width <= 0 || rect.height <= 0) return false;
  for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  }
  // Exclude covered targets using the center of the visible, clipped portion.
  const hit = document.elementFromPoint?.(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return !hit || element.contains(hit) || hit.contains(element);
}

export function collectNavigationTargets(shortcuts: ShortcutOverrides | undefined, platform: string, characterEnabled: boolean) {
  if (hasWorkbenchPopup() || document.querySelector('[data-hackdesk-dragging="true"]')) return [];
  const targets: NavigationTarget[] = [];
  const ids = new Set<string>();
  for (const element of document.querySelectorAll<HTMLElement>(TARGET_SELECTOR)) {
    if (element.matches('[data-hackdesk-focus="editor"]') && element.querySelector('.cm-content')) continue;
    if (!isNavigationVisible(element)) continue;
    const pane = element.closest<HTMLElement>('[data-document-pane-id]')?.dataset.documentPaneId ?? '';
    const treeRow = element.closest<HTMLElement>('[data-folder-tree-row-id]')?.dataset.folderTreeRowId;
    const workspace = element.dataset.workspaceNavigationId;
    const tab = element.dataset.navigationTabId;
    const toolbar = element.closest('[role="toolbar"]')?.getAttribute('aria-label') ?? element.closest<HTMLElement>('[data-hackdesk-focus]')?.dataset.hackdeskFocus ?? '';
    const action = element.dataset.navigationAction as ElectronActionId | undefined;
    const id = workspace ? `workspace:${workspace}` : tab ? `tab:${tab}` : treeRow ? `tree:${treeRow}`
      : element.matches('.cm-content, [data-hackdesk-focus="editor"]') ? `editor:${pane}:${element.closest('[data-navigation-editor-id]')?.getAttribute('data-navigation-editor-id') ?? ''}`
        : element.matches('input') ? 'finder' : `toolbar:${pane}:${toolbar}:${action ?? element.getAttribute('aria-label')}`;
    if (ids.has(id)) continue;
    ids.add(id);
    targets.push({ id, element, activate: Boolean(workspace && workspace !== 'choose-vault' || tab || treeRow),
      shortcut: action ? getResolvedActionShortcut(action, shortcuts, platform, characterEnabled) : element.getAttribute('aria-keyshortcuts')?.replace('Meta+', '⌘').replace('Control+', 'Ctrl+') });
  }
  return targets;
}

export function safeNavigationLetters(platform: string, shortcuts: ShortcutOverrides | undefined, characterEnabled: boolean, editor: HTMLElement | null) {
  const mac = isMacPlatform(platform);
  const blocked = new Set(NATIVE_LETTERS);
  for (const action of ELECTRON_ACTIONS) {
    for (const binding of parseShortcutConfig(resolveWorkbenchShortcut(action.id, shortcuts, characterEnabled) ?? '', platform)) {
      if (mac ? binding.meta : binding.ctrl) blocked.add(binding.key.toLowerCase());
    }
  }
  if (editor) {
    const mode = editor.dataset.editorMode;
    if (editor.dataset.editorModeLoading === 'true') return '';
    // Modal adapters handle some keys outside CodeMirror's public keymap facet.
    // Their Ctrl bindings must win on Windows/Linux, where Ctrl is also primary.
    if (!mac && mode && mode !== 'standard') return '';
    const keymaps = readEditorNavigationKeymap(editor);
    if (!keymaps) return '';
    for (const bindings of keymaps) {
      for (const binding of bindings) {
        if (binding.any) return ''; // An opaque handler cannot safely be predicted.
        const value = (mac ? binding.mac : platform === 'win32' ? binding.win : binding.linux) ?? binding.key;
        for (const stroke of value?.split(' ') ?? []) {
          const parts = stroke.toLowerCase().split('-');
          if (parts.includes('mod') || parts.includes(mac ? 'meta' : 'ctrl')) blocked.add(parts.at(-1)!);
        }
      }
    }
  }
  return Array.from(ALPHABET).filter(letter => !blocked.has(letter)).join('');
}

export function allocateNavigationCodes(ids: string[], letters: string, previous: ReadonlyMap<string, string>) {
  const assigned = new Map<string, string>();
  if (letters.length < 2) return null;
  const conflicts = (code: string) => Array.from(assigned.values()).some(existing => existing.startsWith(code) || code.startsWith(existing));
  for (const id of ids) {
    const old = previous.get(id);
    if (old && Array.from(old).every(letter => letters.includes(letter)) && !conflicts(old)) assigned.set(id, old);
  }
  const missing = ids.filter(id => !assigned.has(id));
  const codes = (length: number) => {
    let values = [''];
    for (let i = 0; i < length; i++) values = values.flatMap(prefix => Array.from(letters, letter => prefix + letter));
    return values.filter(code => !conflicts(code));
  };
  let available = codes(2);
  if (available.length < missing.length) available = codes(3);
  if (available.length < missing.length) return null;
  missing.forEach((id, index) => assigned.set(id, available[index]));
  return assigned;
}

export function navigateToTarget(target: NavigationTarget) {
  if (!isNavigationVisible(target.element)) return false;
  target.element.focus();
  if (target.activate) target.element.click();
  return true;
}

export function navigationHintPositions(hints: NavigationHint[], prefix: string, viewport: { width: number; height: number }) {
  const occupied: DOMRect[] = [];
  return hints.map(hint => {
    const shortcut = !prefix ? hint.shortcut?.split(', ')[0] : undefined;
    const width = Math.max(24, hint.code.length * 6 + 8, (shortcut?.length ?? 0) * 5 + 8);
    const height = shortcut ? 30 : 18;
    const left = Math.max(2, Math.min(viewport.width - width - 2, hint.rect.right - width));
    const preferred = Math.max(2, hint.rect.top - 6);
    const candidates = [preferred, hint.rect.bottom + 2, hint.rect.top - height - 2];
    for (let offset = 1; offset <= hints.length; offset++) candidates.push(preferred + offset * (height + 2), preferred - offset * (height + 2));
    const top = candidates.find(value => value >= 2 && value + height <= viewport.height - 2 && !occupied.some(rect => left < rect.right + 2 && left + width + 2 > rect.left && value < rect.bottom + 2 && value + height + 2 > rect.top)) ?? preferred;
    occupied.push(new DOMRect(left, top, width, height));
    return { hint, shortcut, left, top };
  });
}
