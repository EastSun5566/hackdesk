import {
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import type { EditorState, Line } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { SLIDE_THEMES } from '@/lib/slides';

import { isInCodeBlock, isInFrontMatter, type NoteLinksHost } from './note-links';
import { textAround } from './syntax';

// Front matter keys hackmd.io still reads, plus `type`, which HackDesk reads to offer Present.
const KEYS: [key: string, detail: string][] = [
  ['title', 'Title instead of the first heading'],
  ['description', 'Description for sharing'],
  ['image', 'Image URL for link previews'],
  ['tags', 'Comma-separated tags'],
  ['type', 'slide to present the note'],
  ['breaks', 'Whether single line breaks show'],
  ['lang', 'Language code, such as en or zh-TW'],
  ['dir', 'Text direction'],
  ['robots', 'Search engine indexing'],
  ['GA', 'Google Analytics ID'],
  ['slideOptions', 'reveal.js options for slides'],
];

const SLIDE_OPTION_KEYS: [key: string, detail: string][] = [
  ['theme', 'Slide theme'],
  ['transition', 'Slide transition'],
];

const VALUES: Record<string, string[]> = {
  type: ['slide'],
  breaks: ['true', 'false'],
  dir: ['ltr', 'rtl'],
  robots: ['noindex, nofollow', 'index, follow'],
};

const SLIDE_OPTION_VALUES: Record<string, readonly string[]> = {
  theme: SLIDE_THEMES,
  transition: ['none', 'fade', 'slide', 'convex', 'concave', 'zoom'],
};

/** Tags offered before anything is typed. */
const MAX_UNTYPED_TAGS = 10;

/** Whether an indented front matter line sits under `slideOptions:`. */
function underSlideOptions(state: EditorState, line: Line) {
  for (let number = line.number - 1; number > 1; number -= 1) {
    const text = state.doc.line(number).text;
    if (/^\S/.test(text)) return /^slideOptions:\s*$/.test(text);
  }
  return false;
}

/** Fills a key and opens the next suggestions when the key has some. */
function keyOptions(keys: [key: string, detail: string][], hasValues: (key: string) => boolean): Completion[] {
  return keys.map(([key, detail]): Completion => ({
    label: key,
    detail,
    type: 'property',
    apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
      const { line, after } = textAround(view.state, to);
      const word = /^\w*:?\s*/.exec(after)![0].length;
      const insert = key === 'slideOptions' ? `${key}:\n${/^\s*/.exec(line.text)![0]}  ` : `${key}: `;
      view.dispatch({ changes: { from, to: to + word, insert }, selection: { anchor: from + insert.length } });
      if (key === 'slideOptions' || hasValues(key)) startCompletion(view);
    },
  }));
}

function valueOptions(values: readonly string[]): Completion[] {
  return values.map((value): Completion => ({
    label: value,
    type: 'constant',
    apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
      const { line } = textAround(view.state, to);
      view.dispatch({ changes: { from, to: line.to, insert: value }, selection: { anchor: from + value.length } });
    },
  }));
}

/** Front matter keys at the start of a line, keys under `slideOptions`, and values that have a fixed set. */
function frontMatterSource(context: CompletionContext): CompletionResult | null {
  if (!isInFrontMatter(context.state, context.pos)) return null;
  const { line, before } = textAround(context.state, context.pos);
  if (line.number === 1) return null;

  const key = /^(\s*)(\w*)$/.exec(before);
  if (key) {
    if (!key[2] && !context.explicit) return null;
    const nested = key[1]!.length > 0;
    if (nested && !underSlideOptions(context.state, line)) return null;
    return {
      from: context.pos - key[2]!.length,
      validFor: /^\w*$/,
      options: nested
        ? keyOptions(SLIDE_OPTION_KEYS, name => name in SLIDE_OPTION_VALUES)
        : keyOptions(KEYS, name => name in VALUES || name === 'tags'),
    };
  }

  const value = /^(\s*)(\w+):\s*([\w, -]*)$/.exec(before);
  if (!value) return null;
  const nested = value[1]!.length > 0;
  const values = nested
    ? (underSlideOptions(context.state, line) ? SLIDE_OPTION_VALUES[value[2]!] : undefined)
    : VALUES[value[2]!];
  if (!values) return null;
  return { from: context.pos - value[3]!.length, validFor: /^[\w, -]*$/, options: valueOptions(values) };
}

/** The workspace's tags that match what is typed and are not on the line yet. */
function tagOptions(host: NoteLinksHost, typed: string, existing: string[], format: (tag: string) => string): Completion[] {
  const query = typed.trim().toLowerCase();
  const tags = host.tags().filter(tag => !existing.includes(tag) && tag.toLowerCase().includes(query));
  return (query ? tags : tags.slice(0, MAX_UNTYPED_TAGS)).map((tag): Completion => ({
    label: tag,
    type: 'text',
    apply: (view: EditorView, _completion: Completion, from: number, to: number) => {
      const { after } = textAround(view.state, to);
      const insert = format(tag);
      // closeBrackets may have typed the closing backtick.
      const end = to + (insert.endsWith('`') && after.startsWith('`') ? 1 : 0);
      view.dispatch({ changes: { from, to: end, insert }, selection: { anchor: from + insert.length } });
    },
  }));
}

/** `tags: a, b` in front matter, and the `###### tags: `a` `b`` line, offer the workspace's tags. */
function tagsSource(host: NoteLinksHost) {
  return (context: CompletionContext): CompletionResult | null => {
    const { before } = textAround(context.state, context.pos);
    if (isInFrontMatter(context.state, context.pos)) {
      const match = /^tags:\s*(.*)$/.exec(before);
      if (!match) return null;
      const parts = match[1]!.split(',');
      const typed = parts.at(-1)!.trimStart();
      const options = tagOptions(host, typed, parts.slice(0, -1).map(part => part.trim()), tag => tag);
      return options.length ? { from: context.pos - typed.length, options, filter: false } : null;
    }
    const match = /^#{6}\s+tags:\s*((?:`[^`]*`\s*)*)(`?)([^`\s]*)$/.exec(before);
    // Tags are typed inside backticks, so only a code block keeps them quiet.
    if (!match || isInCodeBlock(context.state, context.pos)) return null;
    const existing = [...match[1]!.matchAll(/`([^`]+)`/g)].map(found => found[1]!);
    const options = tagOptions(host, match[3]!, existing, tag => `\`${tag}\``);
    return options.length ? { from: context.pos - match[3]!.length - match[2]!.length, options, filter: false } : null;
  };
}

/** Suggestions for YAML front matter and tag lines. */
export function frontMatterSources(host: NoteLinksHost): CompletionSource[] {
  return [frontMatterSource, tagsSource(host)];
}
