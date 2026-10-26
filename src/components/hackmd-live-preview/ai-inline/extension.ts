import { Prec, StateEffect, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  keymap,
  showTooltip,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type Tooltip,
} from '@codemirror/view';

import { diffWords } from './diff';
import {
  acceptAiInline,
  aiInlineField,
  closeAiComparison,
  closeAiInline,
  getAiInlineState,
  getAiInsertPosition,
  openAiInline,
  type AiInlineState,
} from './state';

export type AiInlineHost = {
  /** False when no provider is on: ⌘K then falls through to the command palette. */
  isAvailable: () => boolean;
  showSelectionChip: () => boolean;
  /** The panel's DOM, which the host renders its menu and status into. */
  mountPanel: (dom: HTMLElement, view: EditorView) => void;
  /** A replaced panel can be released after its successor mounted, so it names itself. */
  releasePanel: (dom: HTMLElement) => void;
  onStateChange: (state: AiInlineState, view: EditorView) => void;
  /** The chip's label, such as "⌘K". */
  shortcutLabel: () => string;
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

class InsertedTextWidget extends WidgetType {
  constructor(private readonly text: string, private readonly block: boolean) {
    super();
  }

  eq(other: InsertedTextWidget) {
    return other.text === this.text && other.block === this.block;
  }

  toDOM() {
    const dom = document.createElement(this.block ? 'div' : 'span');
    dom.className = this.block ? 'cm-ai-inserted-block' : 'cm-ai-inserted';
    dom.textContent = this.text;
    return dom;
  }

  ignoreEvent() {
    return false;
  }
}

/** Hosts the status toolbar in the text flow under the passage, so it never covers the next line. */
class PanelWidget extends WidgetType {
  constructor(private readonly host: AiInlineHost, private readonly session: number) {
    super();
  }

  // The same session keeps its DOM, so the toolbar is not remounted on every streamed word.
  eq(other: PanelWidget) {
    return other.session === this.session;
  }

  toDOM(view: EditorView) {
    const dom = document.createElement('div');
    dom.className = 'cm-ai-status';
    this.host.mountPanel(dom, view);
    return dom;
  }

  destroy(dom: HTMLElement) {
    this.host.releasePanel(dom);
  }
}

const targetMark = Decoration.mark({ class: 'cm-ai-target' });
const deletedMark = Decoration.mark({ class: 'cm-ai-deleted' });

function buildDecorations(state: EditorState, host: AiInlineHost): DecorationSet {
  const session = getAiInlineState(state);
  if (session.phase === 'idle' || session.from > session.to) return Decoration.none;
  const ranges: Range<Decoration>[] = [];
  const blockAt = getAiInsertPosition(state, session.from, session.to);
  const output = session.output.trim();
  if (session.phase !== 'menu') {
    ranges.push(Decoration.widget({ widget: new PanelWidget(host, session.session), side: 2, block: true }).range(blockAt));
  }

  if (session.phase === 'preview' && session.delivery === 'replace' && output) {
    let position = session.from;
    for (const part of diffWords(session.original, output)) {
      if (part.type === 'insert') {
        ranges.push(Decoration.widget({ widget: new InsertedTextWidget(part.text, false), side: 1 }).range(position));
      } else {
        const end = position + part.text.length;
        if (part.type === 'delete') ranges.push(deletedMark.range(position, end));
        position = end;
      }
    }
    return Decoration.set(ranges, true);
  }

  if (session.to > session.from) ranges.push(targetMark.range(session.from, session.to));
  // While streaming, and for answers added below, the text appears under the passage it is about.
  if (output && (session.phase === 'running' || session.delivery === 'insert-below')) {
    ranges.push(Decoration.widget({ widget: new InsertedTextWidget(output, true), side: 1, block: true }).range(blockAt));
  }
  return Decoration.set(ranges, true);
}

function aiDecorations(host: AiInlineHost) {
  return EditorView.decorations.compute([aiInlineField], state => buildDecorations(state, host));
}

/** The command menu floats above the passage; once a command runs, the status widget takes over. */
function createPanelField(host: AiInlineHost) {
  return StateField.define<Tooltip | null>({
    create: () => null,
    update(tooltip, tr) {
      const session = getAiInlineState(tr.state);
      if (session.phase !== 'menu') return null;
      if (tooltip && tooltip.pos === session.from && getAiInlineState(tr.startState).session === session.session) return tooltip;
      return {
        pos: session.from,
        above: true,
        arrow: false,
        create: (view) => {
          const dom = document.createElement('div');
          dom.className = 'cm-ai-panel';
          return {
            dom,
            mount: () => host.mountPanel(dom, view),
            destroy: () => host.releasePanel(dom),
          };
        },
      };
    },
    provide: field => showTooltip.from(field),
  });
}

const setChip = StateEffect.define<number | null>();

/** The "✦ AI" chip: shown only after a mouse selection, gone on the next key, click or edit. */
function createChipField(host: AiInlineHost) {
  return StateField.define<Tooltip | null>({
    create: () => null,
    update(tooltip, tr) {
      for (const effect of tr.effects) {
        if (!effect.is(setChip)) continue;
        if (effect.value === null) return null;
        return {
          pos: effect.value,
          above: false,
          arrow: false,
          create: (view) => {
            const dom = document.createElement('div');
            dom.className = 'cm-ai-chip';
            const button = dom.appendChild(document.createElement('button'));
            button.type = 'button';
            button.className = 'cm-ai-chip-button';
            button.setAttribute('aria-label', 'Ask AI about the selection');
            button.append('✦ AI');
            const hint = button.appendChild(document.createElement('span'));
            hint.className = 'cm-ai-chip-hint';
            hint.textContent = host.shortcutLabel();
            // Keep the selection: a plain mousedown would move the cursor before the click lands.
            button.addEventListener('mousedown', event => event.preventDefault());
            button.addEventListener('click', () => openAiInlineMenu(view, host));
            return { dom };
          },
        };
      }
      if (tooltip && (tr.docChanged || tr.selection || getAiInlineState(tr.state).phase !== 'idle')) return null;
      return tooltip;
    },
    provide: field => showTooltip.from(field),
  });
}

function chipPlugin(host: AiInlineHost) {
  return ViewPlugin.fromClass(class {
    private pointerDown = false;
    private frame = 0;

    constructor(private readonly view: EditorView) {
      view.contentDOM.addEventListener('mousedown', this.onMouseDown);
      document.addEventListener('mouseup', this.onMouseUp);
    }

    private onMouseDown = () => {
      this.pointerDown = true;
    };

    private onMouseUp = () => {
      if (!this.pointerDown) return;
      this.pointerDown = false;
      // After CodeMirror has applied the selection the drag made.
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => {
        const { state } = this.view;
        const { from, to } = state.selection.main;
        if (!host.showSelectionChip() || !host.isAvailable() || getAiInlineState(state).phase !== 'idle') return;
        if (!state.sliceDoc(from, to).trim()) return;
        this.view.dispatch({ effects: setChip.of(to) });
      });
    };

    destroy() {
      // A release that also closed the note must not dispatch on the destroyed view.
      cancelAnimationFrame(this.frame);
      this.view.contentDOM.removeEventListener('mousedown', this.onMouseDown);
      document.removeEventListener('mouseup', this.onMouseUp);
    }
  });
}

/** Opens the AI menu for the selection, or for the whole note when nothing is selected. */
export function openAiInlineMenu(view: EditorView, host: AiInlineHost, range?: { from: number; to: number }) {
  if (!host.isAvailable()) return false;
  const target = range ?? view.state.selection.main;
  view.dispatch({ effects: [openAiInline.of({ from: target.from, to: target.to }), setChip.of(null)] });
  return true;
}

function aiKeymap(host: AiInlineHost) {
  const runIfOpen = (run: (view: EditorView) => boolean) => (view: EditorView) => (
    getAiInlineState(view.state).phase === 'idle' ? false : run(view)
  );
  // The dialog may mount before its initial focus leaves the editor.
  const accept = (view: EditorView) => {
    const session = getAiInlineState(view.state);
    return session.comparison ? true : session.phase === 'preview' && acceptAiInline(view);
  };
  return Prec.highest(keymap.of([
    {
      key: 'Mod-k',
      run: (view) => {
        if (getAiInlineState(view.state).comparison) return true;
        // Without a selection ⌘K stays the command palette.
        const { from, to } = view.state.selection.main;
        if (!view.state.sliceDoc(from, to).trim()) return false;
        return openAiInlineMenu(view, host);
      },
    },
    { key: 'Enter', run: accept },
    { key: 'Mod-Enter', run: accept },
    {
      key: 'Escape',
      run: runIfOpen((view) => {
        const comparison = getAiInlineState(view.state).comparison;
        view.dispatch({
          effects: comparison ? closeAiComparison.of(null) : closeAiInline.of(null),
          ...(comparison ? { selection: comparison.selection } : {}),
        });
        return true;
      }),
    },
  ]));
}

/** Streamed words and moved ranges stay in the editor; the host hears only about turns of the session. */
function stateListener(host: AiInlineHost) {
  return EditorView.updateListener.of((update) => {
    const before = getAiInlineState(update.startState);
    const after = getAiInlineState(update.state);
    if (before.phase !== after.phase || before.session !== after.session
      || before.delivery !== after.delivery || before.error !== after.error || before.comparison !== after.comparison) {
      host.onStateChange(after, update.view);
    }
  });
}

const aiTheme = EditorView.baseTheme({
  '.cm-ai-target': {
    backgroundColor: 'color-mix(in oklch, var(--primary-default) 14%, transparent)',
    borderRadius: '2px',
  },
  '.cm-ai-deleted': {
    color: 'var(--destructive-default)',
    textDecoration: 'line-through',
    backgroundColor: 'color-mix(in oklch, var(--destructive-default) 12%, transparent)',
  },
  '.cm-ai-inserted': {
    color: 'var(--success-default)',
    backgroundColor: 'color-mix(in oklch, var(--success-default) 14%, transparent)',
    whiteSpace: 'pre-wrap',
  },
  '.cm-ai-inserted-block': {
    margin: '6px 0',
    padding: '8px 12px',
    borderLeft: '3px solid var(--success-default)',
    borderRadius: '4px',
    backgroundColor: 'color-mix(in oklch, var(--success-default) 10%, transparent)',
    color: 'var(--text-default)',
    whiteSpace: 'pre-wrap',
  },
  '.cm-ai-status': {
    display: 'flex',
    padding: '4px 0',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-tooltip.cm-ai-panel, .cm-tooltip.cm-ai-chip': {
    border: 'none',
    backgroundColor: 'transparent',
  },
  '.cm-ai-chip-button': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '4px',
    padding: '2px 8px',
    border: '1px solid var(--border-default)',
    borderRadius: '999px',
    backgroundColor: 'var(--background-default)',
    color: 'var(--text-default)',
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
    boxShadow: '0 2px 8px color-mix(in oklch, black 12%, transparent)',
    cursor: 'pointer',
  },
  '.cm-ai-chip-button:hover': {
    backgroundColor: 'var(--background-selected)',
  },
  '.cm-ai-chip-hint': {
    color: 'var(--text-subtle)',
  },
});

/** Inline AI: ⌘K or the selection chip opens a menu; answers are previewed as decorations until accepted. */
export function aiInline(host: AiInlineHost): Extension {
  return [
    aiInlineField,
    aiDecorations(host),
    createPanelField(host),
    createChipField(host),
    chipPlugin(host),
    aiKeymap(host),
    stateListener(host),
    aiTheme,
  ];
}

export function formatAiShortcut() {
  return isMac ? '⌘K' : 'Ctrl+K';
}
