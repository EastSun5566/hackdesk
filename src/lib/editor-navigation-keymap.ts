import type { KeyBinding } from '@codemirror/view';

const editorKeymaps = new WeakMap<HTMLElement, () => readonly (readonly KeyBinding[])[]>();

// The lazy-loaded editor owns its current keymap; Workbench navigation does not load CodeMirror.
export function registerEditorNavigationKeymap(element: HTMLElement, read: () => readonly (readonly KeyBinding[])[]) {
  editorKeymaps.set(element, read);
  return () => editorKeymaps.delete(element);
}

export function readEditorNavigationKeymap(element: HTMLElement) {
  return editorKeymaps.get(element)?.() ?? null;
}
