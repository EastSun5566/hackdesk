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
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

import {
  getFrontmatterRange,
  addHackmdLineSyntaxRanges,
  addHfmBlockRanges,
  expandActiveHfmBlockLines,
  getActiveHfmBlocks,
  getActiveLines,
  revealInitialSelection,
} from './hfm-decoration-ranges';
import { getCodeFenceLineRole, getCodeFenceLines, getCodeFences, type CodeFence } from './code-fences';
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
  CodeBlock: 'cm-hackmd-indented-code',
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

class CodeLanguageLabelWidget extends WidgetType {
  constructor(private readonly label: string) {
    super();
  }

  eq(other: CodeLanguageLabelWidget): boolean {
    return other.label === this.label;
  }

  toDOM(): HTMLElement {
    const label = document.createElement('span');
    label.className = 'cm-hackmd-code-label';
    label.textContent = this.label;
    return label;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

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
    private previewState: EditorState;
    private document: PreviewDocument;

    constructor(readonly view: EditorView) {
      this.previewState = view.state;
      this.document = buildPreviewDocument(view.state);
      this.decorations = buildDecorations(view, view.state, this.document);
    }

    private rebuild(state = this.view.state, treeGrew = false) {
      if (treeGrew || this.document.doc !== state.doc || this.document.sourceTree !== syntaxTree(state)) {
        this.document = buildPreviewDocument(state);
      }
      this.decorations = buildDecorations(this.view, state, this.document);
    }

    update(update: ViewUpdate) {
      const previewWasFrozen = update.startState.field(previewFrozenField);
      const previewIsFrozen = update.state.field(previewFrozenField);
      const previewJustUnfroze = previewWasFrozen && !previewIsFrozen;
      const treeGrew = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(treeGrowthEffect)),
      );

      if (previewIsFrozen && !previewJustUnfroze) {
        if (update.docChanged || treeGrew) {
          this.previewState = update.state;
          this.rebuild(update.state, treeGrew);
        } else if (update.viewportChanged) {
          // Auto-scroll during a pointer selection must decorate new lines
          // without revealing source under the pointer until the freeze ends.
          this.rebuild(this.previewState);
        }
        return;
      }

      if (update.docChanged || update.selectionSet || update.viewportChanged || treeGrew || previewJustUnfroze || update.transactions.some((tr) => tr.effects.some((effect) => effect.is(revealInitialSelection)))) {
        this.previewState = update.state;
        this.rebuild(update.state, treeGrew);
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

function buildPreviewDocument(state: EditorState) {
  const sourceTree = syntaxTree(state);
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
  const codeFences = getCodeFences(state, tree);
  const fencedCodeLines = getCodeFenceLines(codeFences);
  const frontmatter = getFrontmatterRange(state.doc);
  // Front matter is YAML: no markdown or HackMD syntax is decorated inside it.
  const sourceOnlyLines = new Set(fencedCodeLines);
  for (let lineNumber = 1; frontmatter && lineNumber <= frontmatter.endLine; lineNumber += 1) sourceOnlyLines.add(lineNumber);
  const hfmBlockRanges = getHfmDocumentIndex(state).blockRanges
    .filter((blockRange) => !blockRangeOverlapsLines(blockRange.startLine, blockRange.endLine, sourceOnlyLines));
  const orderedListMarkers = getOrderedListMarkerPreviews(state);
  return { doc: state.doc, sourceTree, tree, codeFences, fencedCodeLines, frontmatter, sourceOnlyLines, hfmBlockRanges, orderedListMarkers };
}

type PreviewDocument = ReturnType<typeof buildPreviewDocument>;

function buildDecorations(view: EditorView, state: EditorState, document: PreviewDocument): DecorationSet {
  const { tree, codeFences, frontmatter, sourceOnlyLines, hfmBlockRanges, orderedListMarkers } = document;
  const frontmatterEnd = frontmatter ? state.doc.line(frontmatter.endLine).to : -1;
  // Opening fence lines that show a language label in place of their source.
  const labelledFenceLines = new Set<number>();
  const ranges: PreviewRange[] = [];
  const activeLines = getActiveLines(state);
  const activeInlineSourceStarts = new Set<number>();
  const activeHfmBlocks = getActiveHfmBlocks(hfmBlockRanges, activeLines);

  expandActiveHfmBlockLines(activeHfmBlocks, activeLines);

  if (frontmatter) addFrontmatterPanel(state, ranges, frontmatter.endLine, activeLines);
  addHfmBlockRanges(state, hfmBlockRanges, activeHfmBlocks, ranges);
  const visibleLines = new Set<number>();
  for (const { from, to } of view.visibleRanges) {
    const startLine = state.doc.lineAt(from).number;
    const endLine = state.doc.lineAt(to).number;
    for (let number = startLine; number <= endLine; number++) visibleLines.add(number);
    addHackmdLineSyntaxRanges(state, activeLines, ranges, sourceOnlyLines, startLine, endLine);
  }

  // Block replacements stay in StateFields. Only this plugin's inline/line
  // decorations can follow the viewport without changing vertical structure.
  const visited = new Set<string>();
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        // The markdown parser reads YAML as paragraphs, links and setext headings; leave it alone.
        if (node.to <= frontmatterEnd && node.name !== 'Document') return false;
        const key = `${node.name}:${node.from}:${node.to}`;
        if (visited.has(key)) return;
        visited.add(key);
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
          const fence = codeFences.get(startLine);
          if (fence) {
            addCodeFenceRanges(state, ranges, fence, fenceIsActive, visibleLines, labelledFenceLines);
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
          addLineClass(state, ranges, node.from, node.to, lineClass, visibleLines);
        }

        const markClass = inlineMarkClassByNodeName[node.name];
        if (markClass && node.to > node.from) {
          ranges.push(Decoration.mark({ class: markClass }).range(node.from, node.to));
        }

        if (node.name === 'ListMark') {
          addListMarker(state, activeLines, orderedListMarkers, ranges, node.from, node.to, getListDepth(node.node));
          return;
        }

        if (node.name === 'TaskMarker') {
          addTaskMarker(state, activeLines, ranges, node.from, node.to);
          return;
        }

        if ((node.name === 'CodeMark' || node.name === 'CodeInfo') && labelledFenceLines.has(state.doc.lineAt(node.from).number)) {
          return;
        }

        if (hideableSyntaxNodeNames.has(node.name)) {
          addHiddenSyntax(state, activeLines, activeInlineSourceStarts, ranges, node);
        }
      },
    });
  }

  return Decoration.set(ranges, true);
}

/** How many lists enclose this list mark's own list: 0 for a top-level item. */
function getListDepth(node: SyntaxNodeLike['node']): number {
  let depth = -1;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.name === 'BulletList' || parent.name === 'OrderedList') depth += 1;
  }
  return Math.max(0, depth);
}

/**
 * Front matter is shown as a quiet panel like a code fence: away from the cursor its `---` lines
 * become a slim "Metadata" header and the bottom padding, and keys are set apart from values.
 */
function addFrontmatterPanel(state: EditorState, ranges: PreviewRange[], endLine: number, activeLines: ReadonlySet<number>) {
  let active = false;
  for (let lineNumber = 1; lineNumber <= endLine; lineNumber += 1) {
    if (activeLines.has(lineNumber)) active = true;
  }

  for (let lineNumber = 1; lineNumber <= endLine; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const classes = ['cm-hackmd-fenced-code', 'cm-hackmd-frontmatter'];
    if (lineNumber === 1) {
      classes.push('cm-hackmd-code-header');
      if (!active) {
        classes.push('cm-hackmd-code-header-collapsed');
        pushReplace(ranges, state.doc, line.from, line.to, { widget: new CodeLanguageLabelWidget('Metadata') });
      }
    } else if (lineNumber === endLine) {
      classes.push('cm-hackmd-code-footer');
      if (!active) {
        classes.push('cm-hackmd-code-footer-collapsed');
        pushReplace(ranges, state.doc, line.from, line.to);
      }
    } else {
      const key = line.text.match(/^(\s*-?\s*)([^\s:#][^:#]*?:)(?=\s|$)/);
      if (key) {
        const from = line.from + key[1].length;
        ranges.push(Decoration.mark({ class: 'cm-hackmd-frontmatter-key' }).range(from, from + key[2].length));
      } else if (/^\s*#/.test(line.text)) {
        ranges.push(Decoration.mark({ class: 'cm-hackmd-frontmatter-comment' }).range(line.from, line.to));
      }
    }
    ranges.push(Decoration.line({ attributes: { class: classes.join(' ') } }).range(line.from));
  }
}

/**
 * Shapes a fence into one panel: its opening line becomes a slim header with the language label,
 * its closing line slim bottom padding, and numbered fences get a line-number gutter. With the
 * cursor in the fence, both fence lines show their source at full size.
 */
function addCodeFenceRanges(
  state: EditorState,
  ranges: PreviewRange[],
  fence: CodeFence,
  fenceIsActive: boolean,
  visibleLines: ReadonlySet<number>,
  labelledFenceLines: Set<number>,
) {
  for (let lineNumber = fence.startLine; lineNumber <= fence.endLine; lineNumber += 1) {
    if (!visibleLines.has(lineNumber)) continue;
    const line = state.doc.line(lineNumber);
    const role = getCodeFenceLineRole(fence, lineNumber);

    if (role.kind === 'header') {
      const classes = ['cm-hackmd-code-header'];
      if (!fenceIsActive) classes.push('cm-hackmd-code-header-collapsed');
      if (fence.endLine === fence.startLine) classes.push('cm-hackmd-code-last');
      ranges.push(Decoration.line({ attributes: { class: classes.join(' ') } }).range(line.from));
      if (!fenceIsActive && line.length > 0) {
        labelledFenceLines.add(lineNumber);
        pushReplace(ranges, state.doc, line.from, line.to, fence.label ? { widget: new CodeLanguageLabelWidget(fence.label) } : {});
      }
      continue;
    }

    if (role.kind === 'footer') {
      const className = fenceIsActive ? 'cm-hackmd-code-footer' : 'cm-hackmd-code-footer cm-hackmd-code-footer-collapsed';
      ranges.push(Decoration.line({ attributes: { class: className } }).range(line.from));
      continue;
    }

    const classes: string[] = [];
    const attributes: Record<string, string> = {};
    if (role.last) classes.push('cm-hackmd-code-last');
    if (role.number !== null && fence.numbering) {
      classes.push('cm-hackmd-code-numbered');
      attributes['data-line-number'] = String(role.number);
      attributes.style = `--cm-code-gutter: ${fence.numbering.width}ch`;
    }
    if (classes.length > 0) {
      ranges.push(Decoration.line({ attributes: { ...attributes, class: classes.join(' ') } }).range(line.from));
    }
  }
}

function blockRangeOverlapsLines(startLine: number, endLine: number, lines: ReadonlySet<number>): boolean {
  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
    if (lines.has(lineNumber)) {
      return true;
    }
  }

  return false;
}

function hasUrl(node: SyntaxNodeParentLike): boolean {
  return (node as SyntaxNodeParentLike & { getChild?: (name: string) => unknown }).getChild?.('URL') != null;
}

function isSingleLineRange(state: EditorState, from: number, to: number) {
  return to > from && state.doc.lineAt(from).number === state.doc.lineAt(Math.max(from, to - 1)).number;
}

function isInactiveSingleLineRange(state: EditorState, activeLines: Set<number>, from: number, to: number) {
  if (to <= from) {
    return false;
  }

  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(Math.max(from, to - 1));

  return startLine.number === endLine.number && !activeLines.has(startLine.number);
}

function addLineClass(
  state: EditorState, ranges: PreviewRange[], from: number, to: number,
  className: string, visibleLines: ReadonlySet<number>,
) {
  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(Math.max(from, to - 1));

  for (const lineNumber of visibleLines) {
    if (lineNumber < startLine.number || lineNumber > endLine.number) continue;
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

  if (linkChildSyntaxNodeNames.has(name)) {
    let parent = node.node.parent;
    while (parent && parent.name !== 'Link' && parent.name !== 'Image') {
      parent = parent.parent;
    }

    if (name === 'URL' && parent?.name !== 'Link' && parent?.name !== 'Image') {
      return;
    }

    if ((parent?.name === 'Link' || parent?.name === 'Image') && hasUrl(parent)) {
      // A link's source opens only while the cursor is in that link, not anywhere on its line:
      // a line of links would otherwise turn into a wall of URLs as soon as the cursor lands on it.
      // Bracket-only text the parser also calls a link (`[!note]`, `[name=…]`) keeps line rules.
      if (activeInlineSourceStarts.has(parent.from) || !isSingleLineRange(state, from, to)) {
        return;
      }
      pushReplace(ranges, state.doc, from, to);
      return;
    }
  }

  if (!isInactiveSingleLineRange(state, activeLines, from, to)) {
    return;
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
