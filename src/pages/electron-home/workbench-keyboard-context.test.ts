import { describe, expect, it } from 'vitest';
import { canRunContextShortcut, scrollFocusedRegion } from './workbench-keyboard-context';
const bareKeys = { metaKey: false, ctrlKey: false, altKey: false };

function container() {
  const parent = document.createElement('div');
  parent.style.overflowY = 'auto';
  Object.defineProperties(parent, { clientHeight: { value: 200 }, scrollHeight: { value: 900 } });
  const child = document.createElement('button');
  parent.append(child); document.body.append(parent); child.focus();
  return { parent, child };
}

describe('contextual keyboard navigation', () => {
  it('scrolls the nearest focused container half a page, preserving focus', () => {
    const { parent, child } = container();
    expect(scrollFocusedRegion(1)).toBe(true);
    expect(parent.scrollTop).toBe(100);
    expect(child).toHaveFocus();
    expect(scrollFocusedRegion(-1)).toBe(true);
    expect(parent.scrollTop).toBe(0);
    expect(scrollFocusedRegion(-1)).toBe(false);
    parent.remove();
  });
  it('does not use an outer scroll container at the nearest boundary', () => {
    const outer = container(); const inner = container(); outer.parent.append(inner.parent); inner.child.focus();
    inner.parent.scrollTop = 700;
    expect(scrollFocusedRegion(1)).toBe(false);
    expect(outer.parent.scrollTop).toBe(0);
    outer.parent.remove();
  });
  it('leaves editing, missing scroll containers and unrelated popups untouched', () => {
    const { parent } = container(); const input = document.createElement('input'); parent.append(input); input.focus();
    expect(scrollFocusedRegion(1)).toBe(false);
    expect(canRunContextShortcut('search-notes', input, bareKeys)).toBe(false);
    expect(canRunContextShortcut('show-keyboard-shortcuts', input, bareKeys)).toBe(false);
    expect(canRunContextShortcut('show-keyboard-shortcuts', input, { ...bareKeys, metaKey: true })).toBe(true);
    parent.remove();
    const button = document.createElement('button'); document.body.append(button); button.focus();
    expect(scrollFocusedRegion(1)).toBe(false);
    const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); document.body.append(dialog);
    expect(canRunContextShortcut('show-keyboard-shortcuts', button, bareKeys)).toBe(false);
    expect(canRunContextShortcut('focus-next-region', button, bareKeys)).toBe(false);
    dialog.remove(); button.remove();
  });
});
