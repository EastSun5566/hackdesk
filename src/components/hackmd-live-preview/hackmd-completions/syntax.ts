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
import { isInCodeOrFrontMatter, isInFrontMatter } from './note-links';

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

function textBefore(context: CompletionContext) {
  const line = context.state.doc.lineAt(context.pos);
  return { line, before: line.text.slice(0, context.pos - line.from), after: line.text.slice(context.pos - line.from) };
}

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
 */
function blockOptions(context: CompletionContext, names: [name: string, detail: string][], marker: string, indent: string, typed: string) {
  const { line, after } = textBefore(context);
  const from = context.pos - typed.length;
  const closes = writesNewBlock(context.state, line, after.replace(/^[`~]+$/, ''));
  return names.map(([name, detail]): Completion => ({
    label: name,
    detail,
    type: 'keyword',
    apply: (view: EditorView) => {
      if (!closes) {
        const word = /^[\w+-]*/.exec(after)![0];
        view.dispatch({ changes: { from, to: context.pos + word.length, insert: name } });
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
    options: blockOptions(context, languages, match[2]!, match[1]!, match[3]!),
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
    options: blockOptions(context, CONTAINERS, ':::', match[1]!, match[2]!),
    validFor: /^[a-z]*$/i,
  };
}

/** `{%` at the start of a line lists embeds; `{%hackmd` then lists the notes to embed. */
function embedNameSource(context: CompletionContext): CompletionResult | null {
  const { line, before, after } = textBefore(context);
  const match = /^\s*\{%([a-z]*)$/i.exec(before);
  if (!match || isInCodeOrFrontMatter(context.state, context.pos)) return null;
  const typed = match[1]!;
  const from = context.pos - typed.length;
  // closeBrackets may have typed the closing brace already.
  const unfinished = /^\s*%?\}?\s*$/.test(after);
  return {
    from,
    validFor: /^[a-z]*$/i,
    options: EMBEDS.map(([name, detail]): Completion => ({
      label: name,
      detail,
      type: 'keyword',
      apply: (view: EditorView) => {
        if (!unfinished) {
          const word = /^[a-z]*/i.exec(after)![0];
          view.dispatch({ changes: { from, to: context.pos + word.length, insert: name } });
          return;
        }
        view.dispatch({ changes: { from, to: line.to, insert: `${name}  %}` }, selection: { anchor: from + name.length + 1 } });
        if (name === 'hackmd') startCompletion(view);
      },
    })),
  };
}

/** Suggestions for HackMD syntax that does not depend on the workspace's notes. */
export const syntaxSources: CompletionSource[] = [emojiSource, fenceSource, containerSource, embedNameSource];
