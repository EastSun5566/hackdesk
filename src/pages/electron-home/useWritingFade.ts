import { useEffect } from 'react';

// Shift is left out: it starts every capital letter, and the workbench would flicker back.
const MODIFIERS = new Set(['Meta', 'Control', 'Alt']);

function inEditor(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('.cm-editor'));
}

/**
 * Marks the page while you type in a note, so the chrome around it fades. Moving the pointer,
 * reaching for a modifier, or leaving the editor brings it back; a pause does not, so thinking
 * does not make it flicker. The mark lives on <html> so typing never re-renders the workbench.
 */
export function useWritingFade(enabled: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    const show = () => { delete root.dataset.writing; };
    if (!enabled) {
      show();
      return undefined;
    }
    const keydown = (event: KeyboardEvent) => {
      if (MODIFIERS.has(event.key) || event.metaKey || event.ctrlKey || event.altKey) {
        show();
        return;
      }
      if (inEditor(event.target)) root.dataset.writing = 'true';
    };
    const focusin = (event: FocusEvent) => {
      if (!inEditor(event.target)) show();
    };
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('pointermove', show);
    document.addEventListener('focusin', focusin);
    window.addEventListener('blur', show);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('pointermove', show);
      document.removeEventListener('focusin', focusin);
      window.removeEventListener('blur', show);
      show();
    };
  }, [enabled]);
}
