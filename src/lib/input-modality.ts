/**
 * Whether the last interaction was a pointer or the keyboard, on the root as data-input-modality.
 * Focus rings show only for keyboard use (see styles.css): Chromium also treats a text field
 * focused by a click, and focus the app moves after a click, as focus-visible, which drew rings a
 * native app would not.
 */
export type InputModality = 'keyboard' | 'pointer';

// Holding a modifier (⌘ to show hints, ⇧ before a click) says nothing about how focus will move.
const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'Fn']);

export function installInputModality(doc: Document = document) {
  const root = doc.documentElement;
  const set = (modality: InputModality) => {
    if (root.dataset.inputModality !== modality) root.dataset.inputModality = modality;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!MODIFIER_KEYS.has(event.key)) set('keyboard');
  };
  const onPointerDown = () => set('pointer');
  // Capture, so the mode is set before any handler moves focus in response.
  doc.addEventListener('keydown', onKeyDown, true);
  doc.addEventListener('pointerdown', onPointerDown, true);
  return () => {
    doc.removeEventListener('keydown', onKeyDown, true);
    doc.removeEventListener('pointerdown', onPointerDown, true);
    delete root.dataset.inputModality;
  };
}
