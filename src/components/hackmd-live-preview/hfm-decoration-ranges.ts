import { StateEffect, StateField, type EditorState, type Line } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

import { parseSpoilerOpener } from './hfm-block-ranges';
import {
  getHfmLineDecorations,
  type HfmBlockRange,
} from './hfm-recognizers';
import { pushReplace, type PreviewRange } from './preview-ranges';

const alertTitles: Record<string, string> = {
  caution: 'Caution',
  important: 'Important',
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
};

const alertIcons: Record<string, string> = {
  caution: '!',
  important: '!',
  note: 'i',
  tip: '!',
  warning: '!',
};

/** An alert's icon and default title; with a title of its own, only the icon, before that text. */
class AlertHeaderWidget extends WidgetType {
  constructor(private readonly variant: string, private readonly titled: boolean) {
    super();
  }

  eq(other: AlertHeaderWidget): boolean {
    return other.variant === this.variant && other.titled === this.titled;
  }

  toDOM(): HTMLElement {
    const header = document.createElement('span');
    const variant = this.variant in alertTitles ? this.variant : 'note';
    header.className = `cm-hackmd-alert-heading cm-hackmd-alert-heading-${variant}`;
    if (this.titled) header.classList.add('cm-hackmd-alert-heading-titled');
    header.setAttribute('contenteditable', 'false');

    const icon = document.createElement('span');
    icon.className = 'cm-hackmd-alert-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = alertIcons[variant] ?? 'i';
    header.append(icon);

    if (!this.titled) {
      const title = document.createElement('span');
      title.className = 'cm-hackmd-alert-title';
      title.textContent = alertTitles[variant] ?? 'Note';
      header.append(title);
    }
    return header;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/** A spoiler's disclosure mark, as hackmd.io draws it closed (or open with `state="open"`), and its default summary. */
class SpoilerSummaryWidget extends WidgetType {
  constructor(private readonly open: boolean, private readonly summarized: boolean) {
    super();
  }

  eq(other: SpoilerSummaryWidget): boolean {
    return other.open === this.open && other.summarized === this.summarized;
  }

  toDOM(): HTMLElement {
    const summary = document.createElement('span');
    summary.className = `cm-hackmd-spoiler-disclosure${this.open ? ' cm-hackmd-spoiler-disclosure-open' : ''}`;
    summary.setAttribute('contenteditable', 'false');
    summary.title = this.open ? 'Open when published' : 'Collapsed when published';
    if (!this.summarized) {
      // A <details> without a summary is labelled "Details".
      const label = document.createElement('span');
      label.className = 'cm-hackmd-spoiler-summary';
      label.textContent = 'Details';
      summary.append(label);
    }
    return summary;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class LineBreakWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    // The editor cannot break the line the way the rendered note does, so it marks where `<br>` is.
    const mark = document.createElement('span');
    mark.className = 'cm-hackmd-html-br';
    mark.setAttribute('aria-label', 'line break');
    mark.textContent = '↵';
    return mark;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class DisclosureWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const mark = document.createElement('span');
    mark.className = 'cm-hackmd-html-disclosure';
    mark.setAttribute('aria-hidden', 'true');
    return mark;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

const hiddenRangeWidgets = {
  disclosure: new DisclosureWidget(),
  'line-break': new LineBreakWidget(),
};

export const revealInitialSelection = StateEffect.define<void>();
const initialSelectionHidden = StateField.define<boolean>({
  create: () => true,
  update: (hidden, transaction) => hidden && !transaction.effects.some((effect) => effect.is(revealInitialSelection)),
});

/** Keep the initial selection out of the preview until the editor receives focus. */
export const hideInitialSelection = [initialSelectionHidden, EditorView.theme({
  '&:not(.cm-focused) .cm-activeLine': { backgroundColor: 'transparent !important' },
}), EditorView.domEventHandlers({
  focus: (_event, view) => { view.dispatch({ effects: revealInitialSelection.of() }); },
})];

export function getActiveLines(state: EditorState): Set<number> {
  const activeLines = new Set<number>();
  if (state.field(initialSelectionHidden, false)) return activeLines;

  for (const range of state.selection.ranges) {
    activeLines.add(state.doc.lineAt(range.from).number);
    activeLines.add(state.doc.lineAt(range.to).number);
  }

  return activeLines;
}

export function activeLinesChanged(before: EditorState, after: EditorState): boolean {
  const previous = getActiveLines(before);
  const next = getActiveLines(after);
  return previous.size !== next.size || [...previous].some((line) => !next.has(line));
}

export function getActiveHfmBlocks(
  blockRanges: readonly HfmBlockRange[],
  activeLines: Set<number>,
) {
  return blockRanges.filter((blockRange) => {
    // An unclosed container shows its opener as source anyway; editing below it must not reveal the
    // source of everything to the end of the note.
    if (isUnclosedContainer(blockRange)) return false;
    for (let lineNumber = blockRange.startLine; lineNumber <= blockRange.endLine; lineNumber += 1) {
      if (activeLines.has(lineNumber)) {
        return true;
      }
    }

    return false;
  });
}

function isUnclosedContainer(blockRange: HfmBlockRange) {
  return blockRange.kind === 'container' && blockRange.closerLine === undefined;
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

/**
 * Where a newly opened note puts the cursor: the start of the first line after any front matter,
 * so the metadata panel stays collapsed until it is clicked, else the start of the note.
 */
export function getInitialCursor(doc: EditorState['doc']): number {
  const frontmatter = getFrontmatterRange(doc);
  if (!frontmatter) return 0;
  return frontmatter.endLine < doc.lines ? doc.line(frontmatter.endLine + 1).from : doc.line(frontmatter.endLine).to;
}

/** The YAML front matter block at the top of a note: `---` on line 1 through the next `---`. */
export function getFrontmatterRange(doc: EditorState['doc']): { endLine: number; startLine: 1 } | null {
  if (doc.lines < 2 || doc.line(1).text.trim() !== '---') {
    return null;
  }

  for (let lineNumber = 2; lineNumber <= doc.lines; lineNumber += 1) {
    if (doc.line(lineNumber).text.trim() === '---') {
      return { startLine: 1, endLine: lineNumber };
    }
  }

  return null;
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

    // Without a closer, the opener stays in view: hiding it would make `:::name` vanish while it is typed.
    if (active || isUnclosedContainer(blockRange)) {
      continue;
    }

    const openerLine = state.doc.line(blockRange.openerLine);
    if (blockRange.kind === 'alert') {
      // Like hackmd.io, text after the marker is the alert's title in place of the default one.
      const titled = blockRange.titleFrom !== undefined && blockRange.titleTo !== undefined;
      pushReplace(
        ranges,
        state.doc,
        openerLine.from + blockRange.openerFrom,
        openerLine.from + (blockRange.titleFrom ?? blockRange.openerTo),
        { widget: new AlertHeaderWidget(blockRange.variant, titled) },
      );
      if (titled) {
        ranges.push(Decoration.mark({ class: `cm-hackmd-alert-custom-title cm-hackmd-alert-heading-${blockRange.variant}` })
          .range(openerLine.from + blockRange.titleFrom!, openerLine.from + blockRange.titleTo!));
      }
    } else if (blockRange.variant === 'spoiler') {
      addSpoilerOpenerRanges(state, openerLine, blockRange.openerFrom, ranges);
    } else {
      pushReplace(
        ranges,
        state.doc,
        openerLine.from + blockRange.openerFrom,
        openerLine.from + blockRange.openerTo,
      );
    }

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

/**
 * Shows a spoiler's opener as hackmd.io shows the collapsed section: a disclosure mark and the summary,
 * with `:::spoiler` and the `{…}` attributes hidden. The summary stays source, so its marks still render.
 */
function addSpoilerOpenerRanges(state: EditorState, line: Line, openerFrom: number, ranges: PreviewRange[]) {
  const spoiler = parseSpoilerOpener(line.text);
  if (!spoiler) return;
  const { params, summary } = spoiler;
  const widget = new SpoilerSummaryWidget(spoiler.open, Boolean(summary));
  if (!summary) {
    pushReplace(ranges, state.doc, line.from + openerFrom, line.from + line.text.trimEnd().length, { widget });
    return;
  }
  // Hide everything before the summary (the attributes too when they come first), then any attributes after it.
  pushReplace(ranges, state.doc, line.from + openerFrom, line.from + summary.from, { widget });
  if (params && params.from >= summary.to) {
    pushReplace(ranges, state.doc, line.from + summary.to, line.from + line.text.trimEnd().length);
  } else if (params && params.from > summary.from) {
    pushReplace(ranges, state.doc, line.from + params.from, line.from + params.to);
  }
  ranges.push(Decoration.mark({ class: 'cm-hackmd-spoiler-summary' }).range(line.from + summary.from, line.from + summary.to));
}

export function addHackmdLineSyntaxRanges(
  state: EditorState,
  activeLines: Set<number>,
  ranges: PreviewRange[],
  skippedLines: ReadonlySet<number> = new Set(),
  fromLine = 1,
  toLine = state.doc.lines,
) {
  let lineNumber = fromLine;
  let lineFrom = state.doc.line(fromLine).from;
  for (const text of state.doc.iterLines(fromLine, toLine + 1)) {
    const from = lineFrom;
    lineFrom += text.length + 1;
    const number = lineNumber++;
    if (skippedLines.has(number)) {
      continue;
    }

    const hfmLine = getHfmLineDecorations(text);

    for (const className of hfmLine.lineClasses) {
      ranges.push(Decoration.line({ attributes: { class: className } }).range(from));
    }

    addHackmdInlineSyntaxRanges(from, hfmLine.inlineMarks, ranges);
    addHackmdHiddenSyntaxRanges(state, from, number, activeLines, hfmLine.hiddenRanges, ranges);
  }
}

function addHackmdInlineSyntaxRanges(
  lineFrom: number,
  marks: ReturnType<typeof getHfmLineDecorations>['inlineMarks'],
  ranges: PreviewRange[],
) {
  for (const mark of marks) {
    ranges.push(Decoration.mark({ class: mark.className, attributes: mark.attributes }).range(
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
    pushReplace(
      ranges,
      state.doc,
      lineFrom + hiddenRange.from,
      lineFrom + hiddenRange.to,
      hiddenRange.widget ? { widget: hiddenRangeWidgets[hiddenRange.widget] } : {},
    );
  }
}
