import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { StateEffect } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

export const treeGrowthEffect = StateEffect.define<null>();

const GROWTH_THRESHOLD = 8192;
const TICK_BUDGET_MS = 30;

type IdleHandle =
  | { kind: 'idle'; id: number }
  | { kind: 'raf'; id: number };

function scheduleIdle(callback: () => void): IdleHandle {
  if (typeof window.requestIdleCallback === 'function') {
    return { kind: 'idle', id: window.requestIdleCallback(() => callback()) };
  }

  return { kind: 'raf', id: window.requestAnimationFrame(() => callback()) };
}

function cancelIdle(handle: IdleHandle) {
  if (handle.kind === 'idle' && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(handle.id);
    return;
  }

  if (handle.kind === 'raf') {
    window.cancelAnimationFrame(handle.id);
  }
}

export const treeProgressPlugin = ViewPlugin.fromClass(
  class {
    view: EditorView;
    lastTreeLength: number;
    idleHandle: IdleHandle | null = null;
    destroyed = false;

    constructor(view: EditorView) {
      this.view = view;
      this.lastTreeLength = syntaxTree(view.state).length;
      this.schedule();
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.lastTreeLength = syntaxTree(update.state).length;
        this.schedule();
      }
    }

    destroy() {
      this.destroyed = true;
      if (this.idleHandle !== null) {
        cancelIdle(this.idleHandle);
        this.idleHandle = null;
      }
    }

    schedule() {
      if (this.idleHandle !== null) {
        return;
      }

      this.idleHandle = scheduleIdle(() => {
        this.idleHandle = null;
        if (!this.destroyed) {
          this.tick();
        }
      });
    }

    tick() {
      const state = this.view.state;
      const docLength = state.doc.length;

      if (this.lastTreeLength >= docLength) {
        return;
      }

      const ensured = ensureSyntaxTree(state, docLength, TICK_BUDGET_MS);
      const nextTreeLength = (ensured ?? syntaxTree(state)).length;

      if (
        nextTreeLength >= this.lastTreeLength + GROWTH_THRESHOLD
        || nextTreeLength >= docLength
      ) {
        const previousTreeLength = this.lastTreeLength;
        this.lastTreeLength = nextTreeLength;
        try {
          this.view.dispatch({ effects: treeGrowthEffect.of(null) });
        } catch {
          this.lastTreeLength = previousTreeLength;
          return;
        }
      }

      if (nextTreeLength < docLength) {
        this.schedule();
      }
    }
  },
);
