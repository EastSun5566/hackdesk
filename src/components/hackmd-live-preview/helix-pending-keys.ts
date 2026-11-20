import { ViewPlugin, type EditorView, type PluginValue } from '@codemirror/view';

const PENDING_CLASS = 'cm-hackdesk-hx-pending';

/**
 * codemirror-helix shows pending keys (`<space>`, `g`, a count) in the command panel under the status
 * line, which opens a second bar for one word. Mirror them into the status line instead, just before
 * the cursor position. The package exports no mode state, so this follows its pending-key span
 * (hidden by searchPanelTheme) as it changes.
 */
class HelixPendingKeys implements PluginValue {
  private minor: Element | null = null;
  private pending: HTMLSpanElement | null = null;
  private readonly observer = new MutationObserver(() => this.sync());

  constructor(private readonly view: EditorView) {
    this.attach();
  }

  update() {
    if (!this.minor?.isConnected || !this.pending?.isConnected) this.attach();
  }

  destroy() {
    this.observer.disconnect();
    this.pending?.remove();
  }

  private attach() {
    const minor = this.view.dom.querySelector('.cm-hx-command-panel-flex > span:last-child');
    const status = this.view.dom.querySelector('.cm-hx-status-panel');
    const position = status?.lastElementChild;
    if (!minor || !status || !position) return;

    this.observer.disconnect();
    this.pending?.remove();
    this.minor = minor;
    this.pending = document.createElement('span');
    this.pending.className = PENDING_CLASS;
    status.insertBefore(this.pending, position);
    this.observer.observe(minor, { childList: true, characterData: true, subtree: true });
    this.sync();
  }

  private sync() {
    if (this.pending && this.minor) this.pending.textContent = this.minor.textContent;
  }
}

export const helixPendingKeys = ViewPlugin.fromClass(HelixPendingKeys);
