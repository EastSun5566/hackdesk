import {
  autocompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import type { NoteLinkCandidate } from '@/components/markdown-editor-types';

export type NoteLinksHost = {
  candidates: () => NoteLinkCandidate[];
  titleForUrl: (url: string) => Promise<string | null>;
};

const MAX_OPTIONS = 20;
/** URL formats are offered only right after the paste. */
const PASTE_WINDOW_MS = 1_000;

type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>;

const CODE_NODES = new Set(['FencedCode', 'CodeBlock', 'CodeText', 'InlineCode', 'CodeMark']);

/** Links are not completed, nor embeds shown, inside code or YAML front matter. */
export function isInCodeOrFrontMatter(state: EditorState, pos: number) {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (CODE_NODES.has(node.name)) return true;
  }
  if (!state.doc.line(1).text.startsWith('---')) return false;
  for (let number = 2; number <= state.doc.lines; number += 1) {
    const line = state.doc.line(number);
    if (/^(?:---|\.\.\.)\s*$/.test(line.text)) return pos <= line.to;
  }
  return false;
}

function matches(candidates: NoteLinkCandidate[], term: string) {
  const query = term.trim().toLowerCase();
  return candidates
    .filter(candidate => !query || candidate.title.toLowerCase().includes(query) || candidate.detail.toLowerCase().includes(query))
    .slice(0, MAX_OPTIONS);
}

/** `[text](` searches notes by what is typed in the parentheses, or by the link text when nothing is typed yet. */
function linkSource(host: NoteLinksHost) {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const match = /(?<!!)\[([^\]]+)\]\(([^)\s]*)$/.exec(before);
    if (!match || isInCodeOrFrontMatter(context.state, context.pos)) return null;
    const typed = match[2]!;
    // A web address is being typed, not a note.
    if (/^[a-z][a-z0-9+.-]*:/i.test(typed)) return null;
    const options = matches(host.candidates(), typed || match[1]!).map((candidate): Completion => ({
      label: candidate.title,
      detail: candidate.detail,
      type: 'text',
      apply: (view, _completion, from, to) => {
        const closes = view.state.sliceDoc(to, to + 1) === ')';
        view.dispatch({
          changes: { from, to, insert: closes ? candidate.link : `${candidate.link})` },
          selection: { anchor: from + candidate.link.length + 1 },
        });
      },
    }));
    return options.length ? { from: context.pos - typed.length, options, filter: false } : null;
  };
}

/** `{%hackmd ` lists the notes HackMD can embed, by the reference it understands. */
function embedSource(host: NoteLinksHost) {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const match = /^\s*\{%hackmd\s+([^\s%]*)$/.exec(before);
    if (!match) return null;
    const typed = match[1]!;
    const options = matches(host.candidates().filter(candidate => candidate.embedRef), typed).map((candidate): Completion => ({
      label: candidate.title,
      detail: candidate.embedRef!,
      type: 'text',
      apply: (view, _completion, from, to) => {
        const rest = view.state.sliceDoc(to, line.to);
        const insert = /^\s*%\}/.test(rest) ? candidate.embedRef! : `${candidate.embedRef} %}`;
        view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
      },
    }));
    return options.length ? { from: context.pos - typed.length, options, filter: false } : null;
  };
}

type Paste = { url: string; from: number; to: number; at: number };
const recordPaste = StateEffect.define<Paste | null>();
const pasteField = StateField.define<Paste | null>({
  create: () => null,
  update(paste, transaction) {
    for (const effect of transaction.effects) if (effect.is(recordPaste)) return effect.value;
    if (!paste || !transaction.docChanged) return paste;
    return { ...paste, from: transaction.changes.mapPos(paste.from, -1), to: transaction.changes.mapPos(paste.to, 1) };
  },
});

/** Right after pasting a URL: keep it, make it a Reference `[title](url)`, or a Preview card. */
function pastedUrlSource(host: NoteLinksHost) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const paste = context.state.field(pasteField, false);
    if (!paste || Date.now() - paste.at > PASTE_WINDOW_MS || context.pos !== paste.to) return null;
    if (context.state.sliceDoc(paste.from, paste.to) !== paste.url) return null;
    const title = (await host.titleForUrl(paste.url).catch(() => null)) ?? 'Link';
    const replace = (insert: string): Completion['apply'] => (view) => {
      view.dispatch({
        changes: { from: paste.from, to: paste.to, insert },
        selection: { anchor: paste.from + insert.length },
        effects: recordPaste.of(null),
      });
    };
    return {
      from: paste.from,
      to: paste.to,
      filter: false,
      options: [
        { label: 'URL', detail: 'Keep the address', apply: replace(paste.url) },
        { label: 'Reference', detail: `[${title}](…)`, apply: replace(`[${title.replace(/[[\]]/g, '\\$&')}](${paste.url})`) },
        { label: 'Preview', detail: '{%preview %} card', apply: replace(`{%preview ${paste.url} %}`) },
      ],
    };
  };
}

/** Records a pasted single URL and opens the format menu for it. */
const pasteHandler = EditorView.domEventHandlers({
  paste(event, view) {
    const text = event.clipboardData?.getData('text/plain')?.trim() ?? '';
    if (!/^https?:\/\/\S+$/i.test(text)) return false;
    const { from } = view.state.selection.main;
    if (isInCodeOrFrontMatter(view.state, from)) return false;
    // Let the paste happen first, then offer formats for what landed.
    queueMicrotask(() => {
      const to = view.state.selection.main.head;
      if (view.state.sliceDoc(to - text.length, to) !== text) return;
      view.dispatch({ effects: recordPaste.of({ url: text, from: to - text.length, to, at: Date.now() }) });
      startCompletion(view);
    });
    return false;
  },
});

/** HackMD's ways of linking notes: `[text](` searches notes, `{%hackmd ` lists embeddable notes, pasted URLs offer formats. */
export function noteLinkCompletions(host: NoteLinksHost): Extension {
  return [
    pasteField,
    pasteHandler,
    autocompletion({
      override: [linkSource(host), embedSource(host), pastedUrlSource(host)],
      icons: false,
    }),
  ];
}
