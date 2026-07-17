import type { EditorState } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

import {
  getHfmLineDecorations,
  type HfmBlockRange,
} from './hfm-recognizers';
import { pushReplace, type PreviewRange } from './preview-ranges';

const alertTitles: Record<string, string> = {
  caution: 'Caution',
  danger: 'Caution',
  important: 'Important',
  note: 'Note',
  tip: 'Tip',
  todo: 'Note',
  warning: 'Warning',
};

const alertIcons: Record<string, string> = {
  caution: '!',
  danger: '!',
  important: '!',
  note: 'i',
  tip: '!',
  todo: 'i',
  warning: '!',
};

class AlertHeaderWidget extends WidgetType {
  constructor(private readonly variant: string) {
    super();
  }

  eq(other: AlertHeaderWidget): boolean {
    return other.variant === this.variant;
  }

  toDOM(): HTMLElement {
    const header = document.createElement('span');
    const variant = this.variant in alertTitles ? this.variant : 'note';
    header.className = `cm-hackmd-alert-heading cm-hackmd-alert-heading-${variant}`;
    header.setAttribute('contenteditable', 'false');

    const icon = document.createElement('span');
    icon.className = 'cm-hackmd-alert-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = alertIcons[variant] ?? 'i';

    const title = document.createElement('span');
    title.className = 'cm-hackmd-alert-title';
    title.textContent = alertTitles[variant] ?? 'Note';

    header.append(icon, title);
    return header;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

export function getActiveLines(state: EditorState): Set<number> {
  const activeLines = new Set<number>();

  for (const range of state.selection.ranges) {
    activeLines.add(state.doc.lineAt(range.from).number);
    activeLines.add(state.doc.lineAt(range.to).number);
  }

  return activeLines;
}

export function getActiveHfmBlocks(
  blockRanges: readonly HfmBlockRange[],
  activeLines: Set<number>,
) {
  return blockRanges.filter((blockRange) => {
    for (let lineNumber = blockRange.startLine; lineNumber <= blockRange.endLine; lineNumber += 1) {
      if (activeLines.has(lineNumber)) {
        return true;
      }
    }

    return false;
  });
}

export function expandActiveHfmBlockLines(
  activeHfmBlocks: readonly HfmBlockRange[],
  activeLines: Set<number>,
) {
  for (const blockRange of activeHfmBlocks) {
    for (let lineNumber = blockRange.startLine; lineNumber <= blockRange.endLine; lineNumber += 1) {
      activeLines.add(lineNumber);
    }
  }
}

export function addFrontmatterRanges(state: EditorState, ranges: PreviewRange[]) {
  if (state.doc.lines < 3 || state.doc.line(1).text.trim() !== '---') {
    return;
  }

  for (let lineNumber = 2; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    if (line.text.trim() === '---') {
      for (let frontmatterLine = 1; frontmatterLine <= lineNumber; frontmatterLine += 1) {
        const targetLine = state.doc.line(frontmatterLine);
        ranges.push(Decoration.line({ attributes: { class: 'cm-hackmd-frontmatter' } }).range(targetLine.from));
      }
      return;
    }
  }
}

export function addHfmBlockRanges(
  state: EditorState,
  blockRanges: readonly HfmBlockRange[],
  activeHfmBlocks: readonly HfmBlockRange[],
  ranges: PreviewRange[],
) {
  for (const blockRange of blockRanges) {
    if (blockRange.kind === 'table') {
      continue;
    }

    const active = activeHfmBlocks.includes(blockRange);

    for (let lineNumber = blockRange.startLine; lineNumber <= blockRange.endLine; lineNumber += 1) {
      const line = state.doc.line(lineNumber);
      const position = lineNumber === blockRange.startLine
        ? 'start'
        : lineNumber === blockRange.endLine
          ? 'end'
          : 'middle';
      const className = [
        `cm-hackmd-${blockRange.kind}-block`,
        `cm-hackmd-${blockRange.kind}-block-${blockRange.variant}`,
        `cm-hackmd-${blockRange.kind}-block-${position}`,
      ].join(' ');

      ranges.push(Decoration.line({ attributes: { class: className } }).range(line.from));
    }

    if (active || blockRange.kind === 'blockquote-meta') {
      continue;
    }

    const openerLine = state.doc.line(blockRange.openerLine);
    pushReplace(
      ranges,
      state.doc,
      openerLine.from + blockRange.openerFrom,
      openerLine.from + blockRange.openerTo,
      blockRange.kind === 'alert'
        ? { widget: new AlertHeaderWidget(blockRange.variant) }
        : {},
    );

    if (
      blockRange.closerLine !== undefined
      && blockRange.closerFrom !== undefined
      && blockRange.closerTo !== undefined
    ) {
      const closerLine = state.doc.line(blockRange.closerLine);
      pushReplace(
        ranges,
        state.doc,
        closerLine.from + blockRange.closerFrom,
        closerLine.from + blockRange.closerTo,
      );
    }
  }
}

export function addHackmdLineSyntaxRanges(
  state: EditorState,
  activeLines: Set<number>,
  ranges: PreviewRange[],
  skippedLines: ReadonlySet<number> = new Set(),
) {
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    if (skippedLines.has(lineNumber)) {
      continue;
    }

    const line = state.doc.line(lineNumber);
    const text = line.text;
    const hfmLine = getHfmLineDecorations(text);

    for (const className of hfmLine.lineClasses) {
      ranges.push(Decoration.line({ attributes: { class: className } }).range(line.from));
    }

    addHackmdInlineSyntaxRanges(line.from, hfmLine.inlineMarks, ranges);
    addHackmdHiddenSyntaxRanges(state, line.from, lineNumber, activeLines, hfmLine.hiddenRanges, ranges);
  }
}

function addHackmdInlineSyntaxRanges(
  lineFrom: number,
  marks: ReturnType<typeof getHfmLineDecorations>['inlineMarks'],
  ranges: PreviewRange[],
) {
  for (const mark of marks) {
    ranges.push(Decoration.mark({ class: mark.className }).range(
      lineFrom + mark.from,
      lineFrom + mark.to,
    ));
  }
}

function addHackmdHiddenSyntaxRanges(
  state: EditorState,
  lineFrom: number,
  lineNumber: number,
  activeLines: Set<number>,
  hiddenRanges: ReturnType<typeof getHfmLineDecorations>['hiddenRanges'],
  ranges: PreviewRange[],
) {
  if (activeLines.has(lineNumber)) {
    return;
  }

  for (const hiddenRange of hiddenRanges) {
    pushReplace(ranges, state.doc, lineFrom + hiddenRange.from, lineFrom + hiddenRange.to);
  }
}
