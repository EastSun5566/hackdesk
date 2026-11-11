import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';

import { getFrontmatterRange } from './hfm-decoration-ranges';
import { hfmDocumentIndexExtension, getHfmDocumentIndex } from './hfm-document-index';
import { treeGrowthEffect } from './tree-progress';

/**
 * Blocks drawn as panels (code fences, `:::` containers, and blockquotes and alerts with their bar)
 * need breathing room from whatever touches them.
 * Markdown lets a panel start right under a heading, a paragraph or another panel, and CodeMirror
 * lines cannot take margins (its height map measures line boxes), so a small block spacer is
 * inserted on each side of a panel that touches a non-blank line. A blank line already gives that
 * space, so it gets no spacer.
 */
class PanelSpacerWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  get estimatedHeight(): number {
    return 12;
  }

  toDOM(): HTMLElement {
    const spacer = document.createElement('div');
    spacer.className = 'cm-hackmd-panel-spacer';
    spacer.setAttribute('aria-hidden', 'true');
    return spacer;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

const spacer = new PanelSpacerWidget();

/** The first and last line numbers of every panel, in document order. */
export function getPanelLineRanges(state: EditorState): Array<{ endLine: number; startLine: number }> {
  const tree = ensureSyntaxTree(state, state.doc.length, 200) ?? syntaxTree(state);
  const panels: Array<{ endLine: number; startLine: number }> = [];
  const fencedLines = new Set<number>();
  const frontmatter = getFrontmatterRange(state.doc);
  if (frontmatter) panels.push({ startLine: frontmatter.startLine, endLine: frontmatter.endLine });

  tree.iterate({
    enter(node) {
      if (node.name !== 'FencedCode' && node.name !== 'Blockquote') return;
      if (frontmatter && state.doc.lineAt(node.from).number <= frontmatter.endLine) return false;
      const startLine = state.doc.lineAt(node.from).number;
      const endLine = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
      if (node.name === 'FencedCode') {
        for (let line = startLine; line <= endLine; line += 1) fencedLines.add(line);
      }
      panels.push({ startLine, endLine });
      // Blocks nested in a quote share its bar; only the outermost quote is spaced.
      return false;
    },
  });

  for (const block of getHfmDocumentIndex(state).blockRanges) {
    // A `:::` example inside a code fence is code, not a container.
    if (block.kind !== 'container' || fencedLines.has(block.startLine)) continue;
    panels.push({ startLine: block.startLine, endLine: block.endLine });
  }

  return panels.sort((left, right) => left.startLine - right.startLine);
}

export function getPanelSpacerPositions(state: EditorState): { after: number[]; before: number[] } {
  const before = new Set<number>();
  const after = new Set<number>();
  const isBlank = (lineNumber: number) => state.doc.line(lineNumber).text.trim() === '';

  const panels = getPanelLineRanges(state);
  for (const panel of panels) {
    const { startLine, endLine } = panel;
    // A fence inside a container sits on the container's tint; a gap would cut a hole in it.
    if (panels.some((outer) => outer !== panel && outer.startLine <= startLine && outer.endLine >= endLine)) continue;
    if (startLine > 1 && !isBlank(startLine - 1)) before.add(state.doc.line(startLine).from);
    // Two touching panels need one gap, not two: the next panel's spacer above it provides it.
    if (endLine < state.doc.lines && !isBlank(endLine + 1)) after.add(state.doc.line(endLine).to);
  }

  for (const position of before) {
    const lineNumber = state.doc.lineAt(position).number;
    after.delete(state.doc.line(lineNumber - 1).to);
  }

  return { after: [...after].sort((a, b) => a - b), before: [...before].sort((a, b) => a - b) };
}

function buildPanelSpacers(state: EditorState): DecorationSet {
  const { after, before } = getPanelSpacerPositions(state);
  const ranges: Array<Range<Decoration>> = [
    ...before.map((position) => Decoration.widget({ block: true, side: -1, widget: spacer }).range(position)),
    ...after.map((position) => Decoration.widget({ block: true, side: 1, widget: spacer }).range(position)),
  ];
  return Decoration.set(ranges, true);
}

const panelSpacerField = StateField.define<DecorationSet>({
  create: buildPanelSpacers,
  update(spacers, transaction) {
    if (transaction.docChanged || transaction.effects.some((effect) => effect.is(treeGrowthEffect))) {
      return buildPanelSpacers(transaction.state);
    }
    return spacers;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function hackmdPanelSpacing(): Extension {
  return [hfmDocumentIndexExtension, panelSpacerField];
}
