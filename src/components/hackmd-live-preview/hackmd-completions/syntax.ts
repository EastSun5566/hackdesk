import {
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { EditorState, Line } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { gemoji } from 'gemoji';

import { hfmFenceLanguages } from '../hfm-patterns';
import { isInCodeOrFrontMatter, isInFrontMatter, type NoteLinksHost } from './note-links';

// Languages HackMD highlights that people reach for most; any other name still works when typed.
const CODE_LANGUAGES = [
  'bash', 'c', 'cpp', 'csharp', 'css', 'dart', 'diff', 'dockerfile', 'elixir', 'go', 'graphql', 'haskell',
  'html', 'ini', 'java', 'javascript', 'json', 'kotlin', 'latex', 'lua', 'makefile', 'markdown', 'php',
  'plaintext', 'powershell', 'python', 'r', 'ruby', 'rust', 'scala', 'scss', 'shell', 'sql', 'swift', 'toml',
  'typescript', 'xml', 'yaml',
];

const CONTAINERS: [name: string, detail: string][] = [
  ['info', 'Blue box'],
  ['success', 'Green box'],
  ['warning', 'Yellow box'],
  ['danger', 'Red box'],
  ['spoiler', 'Collapsed section'],
];

const EMBEDS: [name: string, detail: string][] = [
  ['youtube', 'video ID'],
  ['vimeo', 'video ID'],
  ['gist', 'user/gist-id'],
  ['slideshare', 'user/presentation'],
  ['speakerdeck', 'user/presentation'],
  ['pdf', 'PDF URL'],
  ['figma', 'Figma URL'],
  ['hackmd', 'note'],
  ['preview', 'URL for a link card'],
];

let emojiOptions: Completion[] | undefined;

/** Every emoji shortcode, built on first use. */
function allEmoji() {
  emojiOptions ??= gemoji.flatMap(({ emoji, names }) => names.map((name): Completion => ({
    label: `:${name}:`,
    detail: emoji,
    type: 'text',
  })));
  return emojiOptions;
}

export function textAround(state: EditorState, pos: number) {
  const line = state.doc.lineAt(pos);
  return { line, before: line.text.slice(0, pos - line.from), after: line.text.slice(pos - line.from) };
}

const textBefore = (context: CompletionContext) => textAround(context.state, context.pos);

/**
 * `:sm` lists emoji. The colon must not follow a letter, digit or another colon, so times (10:30), web
 * addresses and labels like "note:" stay quiet, and two characters are needed before the list opens.
 */
function emojiSource(context: CompletionContext): CompletionResult | null {
  const { before } = textBefore(context);
  const match = /(?:^|[^\p{L}\p{N}_:])(:[\w+-]{2,})$/u.exec(before);
  if (!match || isInCodeOrFrontMatter(context.state, context.pos)) return null;
  return { from: context.pos - match[1]!.length, options: allEmoji(), validFor: /^:[\w+-]*$/ };
}

/** Whether a fence line starts a code block rather than closing one or sitting inside it. */
function opensCodeBlock(state: EditorState, line: Line) {
  for (let node = syntaxTree(state).resolveInner(line.to, -1); node; node = node.parent!) {
    if (node.name === 'FencedCode') return node.from >= line.from;
    if (!node.parent) break;
  }
  return true;
}

/** A new block is being written when nothing follows on this line or the next. */
function writesNewBlock(state: EditorState, line: Line, after: string) {
  if (after.trim()) return false;
  return line.number === state.doc.lines || !state.doc.line(line.number + 1).text.trim();
}

/**
 * Completes the word after a block marker (``` or :::). For a new block it also adds the closing marker
 * and leaves the cursor on the empty line between, replacing what closeBrackets typed after the cursor.
 * Options are reused while the user keeps typing, so they read the document as it is when chosen.
 */
function blockOptions(names: [name: string, detail: string][], marker: string, indent: string) {
  return names.map(([name, detail]): Completion => ({
    label: name,
    detail,
    type: 'keyword',
    apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
      const { line, after } = textAround(view.state, to);
      if (!writesNewBlock(view.state, line, after.replace(/^[`~]+$/, ''))) {
        const word = /^[\w+-]*/.exec(after)![0];
        view.dispatch({ changes: { from, to: to + word.length, insert: name } });
        return;
      }
      const insert = `${name}\n${indent}\n${indent}${marker}`;
      view.dispatch({
        changes: { from, to: line.to, insert },
        selection: { anchor: from + name.length + 1 + indent.length },
      });
    },
  }));
}

/** ```mer lists code and diagram languages, on the line that opens a code block. */
function fenceSource(context: CompletionContext): CompletionResult | null {
  const { line, before } = textBefore(context);
  const match = /^(\s*)(`{3,}|~{3,})([\w+-]*)$/.exec(before);
  // Without a letter typed, Enter after ``` must still start a new line.
  if (!match || (!match[3] && !context.explicit)) return null;
  if (isInFrontMatter(context.state, context.pos) || !opensCodeBlock(context.state, line)) return null;
  const languages: [string, string][] = [
    ...[...hfmFenceLanguages].map((name): [string, string] => [name, 'Diagram']),
    ...CODE_LANGUAGES.map((name): [string, string] => [name, 'Code']),
  ];
  return {
    from: context.pos - match[3]!.length,
    options: blockOptions(languages, match[2]!, match[1]!),
    validFor: /^[\w+-]*$/,
  };
}

/** :::wa lists container styles, on a line that opens a container. */
function containerSource(context: CompletionContext): CompletionResult | null {
  const { before } = textBefore(context);
  const match = /^(\s*):::\s*([a-z]*)$/i.exec(before);
  // A bare ::: closes a container, so Enter after it must still start a new line.
  if (!match || (!match[2] && !context.explicit) || isInCodeOrFrontMatter(context.state, context.pos)) return null;
  return {
    from: context.pos - match[2]!.length,
    options: blockOptions(CONTAINERS, ':::', match[1]!),
    validFor: /^[a-z]*$/i,
  };
}

/** `{%` at the start of a line lists embeds; `{%hackmd` then lists the notes to embed. */
function embedNameSource(context: CompletionContext): CompletionResult | null {
  const { before } = textBefore(context);
  const match = /^\s*\{%([a-z]*)$/i.exec(before);
  if (!match || isInCodeOrFrontMatter(context.state, context.pos)) return null;
  return {
    from: context.pos - match[1]!.length,
    validFor: /^[a-z]*$/i,
    options: EMBEDS.map(([name, detail]): Completion => ({
      label: name,
      detail,
      type: 'keyword',
      apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
        const { line, after } = textAround(view.state, to);
        // closeBrackets may have typed the closing brace already.
        if (!/^\s*%?\}?\s*$/.test(after)) {
          const word = /^[a-z]*/i.exec(after)![0];
          view.dispatch({ changes: { from, to: to + word.length, insert: name } });
          return;
        }
        view.dispatch({ changes: { from, to: line.to, insert: `${name}  %}` }, selection: { anchor: from + name.length + 1 } });
        if (name === 'hackmd') startCompletion(view);
      },
    })),
  };
}

const ALERTS = ['Note', 'Tip', 'Important', 'Warning', 'Caution'];

/** `[!` in a blockquote lists alert types. On a new alert the next line starts its text. */
function alertSource(context: CompletionContext): CompletionResult | null {
  const { before } = textBefore(context);
  const match = /^\s*>.*\[!([a-z]*)$/i.exec(before);
  if (!match || isInCodeOrFrontMatter(context.state, context.pos)) return null;
  return {
    from: context.pos - match[1]!.length,
    validFor: /^[a-z]*$/i,
    options: ALERTS.map((name): Completion => ({
      label: name,
      type: 'keyword',
      apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
        const { line, after } = textAround(view.state, to);
        const end = to + /^[a-z]*\]?/i.exec(after)![0].length;
        const quote = `${/^\s*>/.exec(line.text)![0]} `;
        const insert = `${name.toUpperCase()}]${end === line.to ? `\n${quote}` : ''}`;
        view.dispatch({ changes: { from, to: end, insert }, selection: { anchor: from + insert.length } });
      },
    })),
  };
}

const COLORS = ['#e8590c', '#f08c00', '#2f9e44', '#0ca678', '#1c7ed6', '#4263eb', '#7048e8', '#ae3ec9', '#e64980'];

/** A time as hackmd.io writes it in `[time=]`, such as "Thu, Oct 29, 2026 7:41 PM". */
export function formatMetadataTime(date: Date) {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const hours = date.getHours() % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${weekday}, ${month} ${date.getDate()}, ${date.getFullYear()} ${hours}:${minutes} ${date.getHours() < 12 ? 'AM' : 'PM'}`;
}

/**
 * `[` and a letter offers `[TOC]` at the start of a line, and `[name=]`, `[time=]` and `[color=]` in a
 * blockquote or list item. Elsewhere a `[` starts a link, so nothing is offered.
 */
function metadataSource(host: NoteLinksHost) {
  return (context: CompletionContext): CompletionResult | null => {
    const { before } = textBefore(context);
    const match = /(^|\s)\[([a-z]*)$/i.exec(before);
    if (!match || (!match[2] && !context.explicit) || isInCodeOrFrontMatter(context.state, context.pos)) return null;
    const lead = before.slice(0, match.index + match[1]!.length);
    const atLineStart = !lead.trim();
    const inQuoteOrList = /^\s*(?:>|(?:[-+*]|\d+\.)\s)/.test(lead);
    const name = host.userName();
    const typed = match[2]!.toLowerCase();
    const tags = ([
      ...(atLineStart ? [['TOC', 'Table of contents', () => 'TOC']] : []),
      ...(inQuoteOrList ? [
        ['name=', name ?? 'Your name', () => `name=${name ?? ''}`],
        ['time=', 'Now', () => `time=${formatMetadataTime(new Date())}`],
        ['color=', 'Random color', () => `color=${COLORS[Math.floor(Math.random() * COLORS.length)]}`],
      ] : []),
    ] as [label: string, detail: string, value: () => string][]).filter(([label]) => label.toLowerCase().startsWith(typed));
    // Link text such as [Plan matches nothing here.
    if (!tags.length) return null;
    return {
      from: context.pos - match[2]!.length,
      validFor: /^[a-z]*$/i,
      options: tags.map(([label, detail, value]): Completion => ({
        label,
        detail,
        type: 'keyword',
        apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
          const { after } = textAround(view.state, to);
          const text = value();
          // Without a name to fill in, the cursor waits after `name=`.
          const waits = text.endsWith('=');
          view.dispatch({
            changes: { from, to: to + (after.startsWith(']') ? 1 : 0), insert: `${text}]` },
            selection: { anchor: from + text.length + (waits ? 0 : 1) },
          });
        },
      })),
    };
  };
}

const SLIDE_ATTRIBUTES: Record<'slide' | 'element', [label: string, insert: string][]> = {
  slide: [
    ['data-background', 'data-background=""'],
    ['data-background-color', 'data-background-color=""'],
    ['data-background-image', 'data-background-image=""'],
    ['data-transition', 'data-transition=""'],
    ['class', 'class=""'],
    ['id', 'id=""'],
  ],
  element: [
    ['class="fragment"', 'class="fragment"'],
    ['data-fragment-index', 'data-fragment-index=""'],
    ['style', 'style=""'],
  ],
};

/** `<!-- .` lists `slide:` and `element:`, then the attributes slides accept for each. */
function slideCommentSource(context: CompletionContext): CompletionResult | null {
  const { before } = textBefore(context);
  if (isInCodeOrFrontMatter(context.state, context.pos)) return null;
  const target = /<!--\s*\.([a-z]*)$/i.exec(before);
  if (target) {
    return {
      from: context.pos - target[1]!.length,
      validFor: /^[a-z]*$/i,
      options: (['slide', 'element'] as const).map((name): Completion => ({
        label: `${name}:`,
        type: 'keyword',
        apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
          const { after } = textAround(view.state, to);
          const word = /^[a-z]*:?/i.exec(after)![0].length;
          const insert = `${name}: ${/^\s*-->/.test(after.slice(word)) ? '' : ' -->'}`;
          view.dispatch({ changes: { from, to: to + word, insert }, selection: { anchor: from + name.length + 2 } });
          startCompletion(view);
        },
      })),
    };
  }
  const attribute = /<!--\s*\.(slide|element):(?:\s+[\w-]+(?:="[^"]*")?)*\s+([\w-]*)$/i.exec(before);
  if (!attribute) return null;
  return {
    from: context.pos - attribute[2]!.length,
    validFor: /^[\w-]*$/,
    options: SLIDE_ATTRIBUTES[attribute[1]!.toLowerCase() as 'slide' | 'element'].map(([label, insert]): Completion => ({
      label,
      type: 'property',
      apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
        const { after } = textAround(view.state, to);
        const word = /^[\w-]*/.exec(after)![0].length;
        // An empty value leaves the cursor between its quotes.
        const anchor = from + insert.length - (insert.endsWith('""') ? 1 : 0);
        view.dispatch({ changes: { from, to: to + word, insert }, selection: { anchor } });
      },
    })),
  };
}

/** Suggestions for HackMD syntax; `[name=]` and tags read the workspace through `host`. */
export function syntaxSources(host: NoteLinksHost): CompletionSource[] {
  return [emojiSource, fenceSource, containerSource, embedNameSource, alertSource, metadataSource(host), slideCommentSource];
}
