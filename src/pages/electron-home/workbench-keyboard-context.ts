import { getElectronAction, resolveWorkbenchShortcut } from '@/lib/electron-actions';
import type { ElectronActionId } from '@/lib/electron-api';
import { matchShortcutConfig, type ShortcutOverrides } from '@/lib/keyboard-shortcuts';

export const EDITING_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor, [data-hackdesk-focus="editor"]';
const POPUP_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

export function hasWorkbenchPopup() {
  return Array.from(document.querySelectorAll<HTMLElement>(POPUP_SELECTOR)).some(element => {
    if (element.closest('[hidden], [inert], [data-closed], [aria-hidden="true"]')) return false;
    return window.getComputedStyle(element).display !== 'none' && window.getComputedStyle(element).visibility !== 'hidden';
  });
}

export function canRunContextShortcut(actionId: ElectronActionId, target: EventTarget | null, event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey'>) {
  if (hasWorkbenchPopup() || document.querySelector('[data-hackdesk-dragging="true"]')) return false;
  const context = getElectronAction(actionId).keyboardContext;
  if (context === 'region') return true;
  const editing = target instanceof Element && Boolean(target.closest(EDITING_SELECTOR));
  if (context === 'scroll') return !editing;
  // Custom modifier shortcuts may open help/Finder while editing.
  return !editing || event.metaKey || event.ctrlKey || event.altKey;
}

export function matchesCharacterShortcut(event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'isComposing' | 'repeat' | 'target'>, shortcuts: ShortcutOverrides | undefined, platform: string, enabled: boolean) {
  if (event.isComposing || event.repeat) return false;
  return (['search-notes', 'show-keyboard-shortcuts'] as const).some(id => {
    const config = resolveWorkbenchShortcut(id, shortcuts, enabled);
    return matchShortcutConfig(config, event as KeyboardEvent, platform) && canRunContextShortcut(id, event.target, event);
  });
}

export function scrollFocusedRegion(direction: -1 | 1) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active.closest(EDITING_SELECTOR) || hasWorkbenchPopup()) return false;
  for (let element: HTMLElement | null = active; element; element = element.parentElement) {
    const style = window.getComputedStyle(element);
    if (!/(auto|scroll)/.test(style.overflowY) || element.clientHeight <= 0 || element.scrollHeight <= element.clientHeight) continue;
    const top = Math.max(0, Math.min(element.scrollHeight - element.clientHeight, element.scrollTop + direction * element.clientHeight / 2));
    if (top === element.scrollTop) return false;
    element.scrollTop = top;
    return true;
  }
  return false;
}
