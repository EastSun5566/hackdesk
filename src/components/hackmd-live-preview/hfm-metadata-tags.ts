import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

import { pushReplace, type PreviewRange } from './preview-ranges';

/**
 * HackMD's `[name=…]`, `[time=…]` and `[color=…]` tags. On hackmd.io they mean something only inside a
 * list item or a blockquote, anywhere in its text: a name shows with a person icon, a time with a clock,
 * and a colour shows nothing but paints the bar of the blockquote around it. Elsewhere they are text.
 */
export type MetadataTag = {
  from: number;
  name: 'color' | 'name' | 'time';
  to: number;
  value: string;
};

// The CSS named colours, which hackmd.io accepts in `[color=]` next to #rgb and #rrggbb.
const namedColors = new Set(`aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
  blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue
  darkcyan darkgoldenrod darkgray darkgreen darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred
  darksalmon darkseagreen darkslateblue darkslategray darkturquoise darkviolet deeppink deepskyblue dimgray
  dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow
  honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral
  lightcyan lightgoldenrodyellow lightgray lightgreen lightpink lightsalmon lightseagreen lightskyblue
  lightslategray lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
  mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred
  midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple
  rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
  slateblue slategray snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke
  yellow yellowgreen`.split(/\s+/));

function isTagColor(value: string) {
  return /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value) || namedColors.has(value.toLowerCase());
}

/** The tags on one line of source, outside inline code and not escaped with a backslash. */
export function findMetadataTags(text: string): MetadataTag[] {
  if (!text.includes('=')) return [];
  const codeSpans = [...text.matchAll(/(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g)]
    .map((match) => ({ from: match.index, to: match.index + match[0].length }));
  const tags: MetadataTag[] = [];
  for (const match of text.matchAll(/(?<!\\)\[(name|time|color)=([^\]\n]+)\]/g)) {
    const from = match.index;
    const to = from + match[0].length;
    if (codeSpans.some((span) => from < span.to && to > span.from)) continue;
    const name = match[1] as MetadataTag['name'];
    const value = match[2]!;
    if (name === 'color' ? !isTagColor(value) : !value.trim()) continue;
    tags.push({ from, name, to, value });
  }
  return tags;
}

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>;

/** The innermost list item or blockquote around `pos`, if any; a tag means something only in one. */
function tagContainer(state: EditorState, pos: number): SyntaxNode | null {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === 'Blockquote' || node.name === 'ListItem') return node;
    if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'HTMLBlock') return null;
  }
  return null;
}

const svgNamespace = 'http://www.w3.org/2000/svg';

function icon(shapes: [tag: string, attributes: Record<string, string>][]) {
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('class', 'cm-hackmd-metadata-tag-icon');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  for (const [tag, attributes] of shapes) {
    const shape = document.createElementNS(svgNamespace, tag);
    for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, value);
    svg.append(shape);
  }
  return svg;
}

const icons = {
  name: () => icon([['circle', { cx: '8', cy: '5', r: '3' }], ['path', { d: 'M2.5 14.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5' }]]),
  time: () => icon([['circle', { cx: '8', cy: '8', r: '6.5' }], ['path', { d: 'M8 4.5V8l2.5 1.5' }]]),
};

class MetadataTagWidget extends WidgetType {
  constructor(private readonly name: 'name' | 'time', private readonly value: string) {
    super();
  }

  eq(other: MetadataTagWidget): boolean {
    return other.name === this.name && other.value === this.value;
  }

  toDOM(): HTMLElement {
    const tag = document.createElement('span');
    tag.className = `cm-hackmd-metadata-tag cm-hackmd-metadata-tag-${this.name}`;
    const value = document.createElement('span');
    value.textContent = this.value;
    tag.append(icons[this.name](), value);
    return tag;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * Draws the tags on lines `fromLine`–`toLine`: names and times as small labelled icons and colours
 * not at all, while the cursor is elsewhere, and paints each blockquote's bar with its colour.
 */
export function addMetadataTagRanges(
  state: EditorState,
  activeLines: ReadonlySet<number>,
  ranges: PreviewRange[],
  skippedLines: ReadonlySet<number>,
  fromLine: number,
  toLine: number,
) {
  const paintedQuotes = new Set<number>();
  for (let number = fromLine; number <= toLine; number += 1) {
    if (skippedLines.has(number)) continue;
    const line = state.doc.line(number);
    for (const tag of findMetadataTags(line.text)) {
      const from = line.from + tag.from;
      const to = line.from + tag.to;
      const container = tagContainer(state, from);
      if (!container || container.to < to) continue;

      if (activeLines.has(number)) {
        ranges.push(Decoration.mark({ class: 'cm-hackmd-metadata-tag-source' }).range(from, to));
      } else if (tag.name === 'color') {
        pushReplace(ranges, state.doc, from, to);
      } else {
        pushReplace(ranges, state.doc, from, to, { widget: new MetadataTagWidget(tag.name, tag.value) });
      }

      if (tag.name === 'color' && container.name === 'Blockquote' && !paintedQuotes.has(container.from)) {
        paintedQuotes.add(container.from);
        // The value is a checked hex or named colour, so it is safe in a style attribute.
        const style = `--cm-quote-bar: ${tag.value.toLowerCase()}`;
        const last = state.doc.lineAt(Math.max(container.from, container.to - 1)).number;
        for (let quoteLine = state.doc.lineAt(container.from).number; quoteLine <= last; quoteLine += 1) {
          ranges.push(Decoration.line({ attributes: { style } }).range(state.doc.line(quoteLine).from));
        }
      }
    }
  }
}
