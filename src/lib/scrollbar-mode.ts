/**
 * Whether the system draws overlay scrollbars (macOS with a trackpad, "Show scroll bars:
 * Automatic") or classic ones that take layout width. Styling `::-webkit-scrollbar` turns every
 * scrollbar classic, so the app styles them only when they are classic already (see styles.css),
 * and overlay scrollbars keep floating inside the content without changing its width.
 */
export type ScrollbarMode = 'overlay' | 'classic';

export function detectScrollbarMode(doc: Document = document): ScrollbarMode {
  const probe = doc.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll;visibility:hidden';
  doc.body.appendChild(probe);
  const mode: ScrollbarMode = probe.offsetWidth - probe.clientWidth > 0 ? 'classic' : 'overlay';
  probe.remove();
  return mode;
}

/** Measures once, before any custom scrollbar style can apply, and records it on the root. */
export function applyScrollbarMode(doc: Document = document) {
  if (!doc.body) return;
  doc.documentElement.dataset.scrollbars = detectScrollbarMode(doc);
}
