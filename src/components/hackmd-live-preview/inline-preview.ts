import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

import {
  addFrontmatterRanges,
  addHackmdLineSyntaxRanges,
  addHfmBlockRanges,
  expandActiveHfmBlockLines,
  getActiveHfmBlocks,
  getActiveLines,
} from './hfm-decoration-ranges';
import { getHfmDocumentIndex, hfmDocumentIndexExtension } from './hfm-document-index';
import { getOrderedListMarkerPreviews } from './list-markers';
import { pushReplace, type PreviewRange } from './preview-ranges';
import {
  addListMarker,
  addTaskMarker,
} from './task-list-widgets';
import { treeGrowthEffect } from './tree-progress';

const FREEZE_TAIL_MS = 100;

const setFrozen = StateEffect.define<boolean>();

const previewFrozenField = StateField.define<boolean>({
  create: () => false,
  update(previous, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setFrozen)) {
        return effect.value;
      }
    }

    return previous;
  },
});

const lineClassByNodeName: Record<string, string> = {
  ATXHeading1: 'cm-hackmd-h1',
  ATXHeading2: 'cm-hackmd-h2',
  ATXHeading3: 'cm-hackmd-h3',
  ATXHeading4: 'cm-hackmd-h4',
  ATXHeading5: 'cm-hackmd-h5',
  ATXHeading6: 'cm-hackmd-h6',
  SetextHeading1: 'cm-hackmd-h1',
  SetextHeading2: 'cm-hackmd-h2',
  Blockquote: 'cm-hackmd-blockquote',
  FencedCode: 'cm-hackmd-fenced-code',
};

const inlineMarkClassByNodeName: Record<string, string> = {
  StrongEmphasis: 'cm-hackmd-strong',
  Emphasis: 'cm-hackmd-em',
  Strikethrough: 'cm-hackmd-strike',
  InlineCode: 'cm-hackmd-inline-code',
  Link: 'cm-hackmd-link',
  Image: 'cm-hackmd-image',
  URL: 'cm-hackmd-autolink',
};

const linkChildSyntaxNodeNames = new Set(['LinkMark', 'URL', 'LinkTitle']);

const hideableSyntaxNodeNames = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'CodeInfo',
  'LinkMark',
  'URL',
  'LinkTitle',
  'StrikethroughMark',
  'QuoteMark',
  'Escape',
]);

type SyntaxNodeLike = {
  from: number;
  name: string;
  node: {
    parent: SyntaxNodeParentLike | null;
  };
  to: number;
};

type SyntaxNodeParentLike = {
  from: number;
  name: string;
  parent: SyntaxNodeParentLike | null;
};

const inlinePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(readonly view: EditorView) {
      this.decorations = buildDecorations(view.state);
    }

    update(update: ViewUpdate) {
      const previewWasFrozen = update.startState.field(previewFrozenField);
      const previewIsFrozen = update.state.field(previewFrozenField);
      const previewJustUnfroze = previewWasFrozen && !previewIsFrozen;
      const treeGrew = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(treeGrowthEffect)),
      );

      if (previewIsFrozen && !previewJustUnfroze) {
        this.decorations = update.docChanged || treeGrew
          ? buildDecorations(update.state)
          : this.decorations;
        return;
      }

      if (update.docChanged || update.selectionSet || update.focusChanged || treeGrew || previewJustUnfroze) {
        this.decorations = buildDecorations(update.state);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
);

const freezeMousePlugin = ViewPlugin.fromClass(
  class {
    private pointerIsDown = false;
    private releaseTimer: number | null = null;

    private readonly handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Node) || !this.view.contentDOM.contains(target)) {
        return;
      }

      this.pointerIsDown = true;
      if (this.releaseTimer !== null) {
        window.clearTimeout(this.releaseTimer);
        this.releaseTimer = null;
      }

      if (!this.view.state.field(previewFrozenField)) {
        this.view.dispatch({ effects: setFrozen.of(true) });
      }
    };

    private readonly handlePointerUp = () => {
      if (!this.pointerIsDown) {
        return;
      }

      this.pointerIsDown = false;
      if (this.releaseTimer !== null) {
        window.clearTimeout(this.releaseTimer);
      }

      this.releaseTimer = window.setTimeout(() => {
        this.releaseTimer = null;
        if (!this.view.state.field(previewFrozenField)) {
          return;
        }

        try {
          this.view.dispatch({ effects: setFrozen.of(false) });
        } catch {
          // The editor may have unmounted before the delayed release.
        }
      }, FREEZE_TAIL_MS);
    };

    constructor(readonly view: EditorView) {
      view.dom.addEventListener('pointerdown', this.handlePointerDown, true);
      window.addEventListener('pointerup', this.handlePointerUp);
      window.addEventListener('pointercancel', this.handlePointerUp);
    }

    destroy() {
      this.view.dom.removeEventListener('pointerdown', this.handlePointerDown, true);
      window.removeEventListener('pointerup', this.handlePointerUp);
      window.removeEventListener('pointercancel', this.handlePointerUp);
      if (this.releaseTimer !== null) {
        window.clearTimeout(this.releaseTimer);
      }
    }
  },
);

export function hackmdInlinePreview(): Extension {
  return [
    hfmDocumentIndexExtension,
    previewFrozenField,
    freezeMousePlugin,
    inlinePreviewPlugin,
  ];
}

function buildDecorations(state: EditorState): DecorationSet {
  const ranges: PreviewRange[] = [];
  const activeLines = getActiveLines(state);
  const activeInlineSourceStarts = new Set<number>();
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
  const fencedCodeLines = getFencedCodeLines(state, tree);
  const hfmBlockRanges = getHfmDocumentIndex(state).blockRanges
    .filter((blockRange) => !blockRangeOverlapsLines(blockRange.startLine, blockRange.endLine, fencedCodeLines));
  const activeHfmBlocks = getActiveHfmBlocks(hfmBlockRanges, activeLines);
  const orderedListMarkers = getOrderedListMarkerPreviews(state);

  expandActiveHfmBlockLines(activeHfmBlocks, activeLines);

  addFrontmatterRanges(state, ranges);
  addHfmBlockRanges(state, hfmBlockRanges, activeHfmBlocks, ranges);
  addHackmdLineSyntaxRanges(state, activeLines, ranges, fencedCodeLines);

  tree.iterate({
    enter(node) {
      if (node.name === 'FencedCode') {
        const startLine = state.doc.lineAt(node.from).number;
        const endLine = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
        let fenceIsActive = false;
        for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
          if (activeLines.has(lineNumber)) {
            fenceIsActive = true;
            break;
          }
        }
        if (fenceIsActive) {
          for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
            activeLines.add(lineNumber);
          }
        }
      }

      if (node.name === 'Link' || node.name === 'Image') {
        for (const range of state.selection.ranges) {
          if (range.from <= node.to && range.to >= node.from) {
            activeInlineSourceStarts.add(node.from);
            break;
          }
        }
      }

      if (node.name === 'HorizontalRule') {
        const line = state.doc.lineAt(node.from);
        if (!activeLines.has(line.number)) {
          ranges.push(Decoration.line({ attributes: { class: 'cm-hackmd-hr' } }).range(line.from));
          pushReplace(ranges, state.doc, line.from, line.to);
        }
        return;
      }

      const lineClass = lineClassByNodeName[node.name];
      if (lineClass) {
        addLineClass(state, ranges, node.from, node.to, lineClass);
      }

      const markClass = inlineMarkClassByNodeName[node.name];
      if (markClass && node.to > node.from) {
        ranges.push(Decoration.mark({ class: markClass }).range(node.from, node.to));
      }

      if (node.name === 'ListMark') {
        addListMarker(state, activeLines, orderedListMarkers, ranges, node.from, node.to);
        return;
      }

      if (node.name === 'TaskMarker') {
        addTaskMarker(state, activeLines, ranges, node.from, node.to);
        return;
      }

      if (hideableSyntaxNodeNames.has(node.name)) {
        addHiddenSyntax(state, activeLines, activeInlineSourceStarts, ranges, node);
      }
    },
  });

  return Decoration.set(ranges, true);
}

function getFencedCodeLines(state: EditorState, tree: ReturnType<typeof syntaxTree>): Set<number> {
  const lines = new Set<number>();

  tree.iterate({
    enter(node) {
      if (node.name !== 'FencedCode') {
        return;
      }

      const startLine = state.doc.lineAt(node.from).number;
      const endLine = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
      for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
        lines.add(lineNumber);
      }
    },
  });

  return lines;
}

function blockRangeOverlapsLines(startLine: number, endLine: number, lines: ReadonlySet<number>): boolean {
  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
    if (lines.has(lineNumber)) {
      return true;
    }
  }

  return false;
}

function isInactiveSingleLineRange(state: EditorState, activeLines: Set<number>, from: number, to: number) {
  if (to <= from) {
    return false;
  }

  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(Math.max(from, to - 1));

  return startLine.number === endLine.number && !activeLines.has(startLine.number);
}

function addLineClass(state: EditorState, ranges: PreviewRange[], from: number, to: number, className: string) {
  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(Math.max(from, to - 1));

  for (let lineNumber = startLine.number; lineNumber <= endLine.number; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    ranges.push(Decoration.line({ attributes: { class: className } }).range(line.from));
  }
}

function addHiddenSyntax(
  state: EditorState,
  activeLines: Set<number>,
  activeInlineSourceStarts: Set<number>,
  ranges: PreviewRange[],
  node: SyntaxNodeLike,
) {
  const { from, to, name } = node;
  if (!isInactiveSingleLineRange(state, activeLines, from, to)) {
    return;
  }

  if (linkChildSyntaxNodeNames.has(name)) {
    let parent = node.node.parent;
    while (parent && parent.name !== 'Link' && parent.name !== 'Image') {
      parent = parent.parent;
    }

    if (name === 'URL' && parent?.name !== 'Link' && parent?.name !== 'Image') {
      return;
    }

    if ((parent?.name === 'Link' || parent?.name === 'Image') && activeInlineSourceStarts.has(parent.from)) {
      return;
    }
  }

  let hideTo = to;
  if (name === 'HeaderMark' || name === 'QuoteMark') {
    while (hideTo < state.doc.length && state.sliceDoc(hideTo, hideTo + 1) === ' ') {
      hideTo += 1;
    }
  }

  if (name === 'Escape') {
    hideTo = Math.min(from + 1, to);
  }

  pushReplace(ranges, state.doc, from, hideTo);
}
