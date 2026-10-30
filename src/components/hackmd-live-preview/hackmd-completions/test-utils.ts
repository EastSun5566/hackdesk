import {
  acceptCompletion,
  closeBrackets,
  CompletionContext,
  currentCompletions,
  setSelectedCompletion,
  startCompletion,
} from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, vi } from 'vitest';

import { hackmdCompletions, type NoteLinksHost } from '.';
import { frontMatterSources } from './front-matter';
import { syntaxSources } from './syntax';

const host: NoteLinksHost = {
  candidates: () => [{ title: 'Beta plan', detail: '@me/beta', link: 'https://hackmd.io/@me/beta', embedRef: '@me/beta' }],
  titleForUrl: async () => null,
  tags: () => ['design', 'planning', 'release'],
  userName: () => null,
};

/** An editor set up like HackDesk's: Markdown, closeBrackets and every HackMD suggestion. */
export function setup(doc: string, cursor = doc.length, overrides: Partial<NoteLinksHost> = {}) {
  return new EditorView({
    parent: document.body.appendChild(document.createElement('div')),
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [markdown(), closeBrackets(), hackmdCompletions({ ...host, ...overrides })],
    }),
  });
}

/** Opens the list and returns its labels once options can be accepted. */
export async function labels(view: EditorView) {
  startCompletion(view);
  await vi.waitFor(() => expect(currentCompletions(view.state).length).toBeGreaterThan(0));
  // Accepting is ignored until the menu has been open briefly (`interactionDelay`).
  await new Promise(resolve => setTimeout(resolve, 100));
  return currentCompletions(view.state).map(option => option.label);
}

function accept(view: EditorView, label: string) {
  const index = currentCompletions(view.state).findIndex(option => option.label === label);
  expect(index).toBeGreaterThanOrEqual(0);
  view.dispatch({ effects: setSelectedCompletion(index) });
  acceptCompletion(view);
}

export async function choose(view: EditorView, label: string) {
  await labels(view);
  accept(view, label);
}

/**
 * Opens the list, types `more` while it stays open (CodeMirror reuses it without asking the source
 * again), then chooses `label`.
 */
export async function typeOnThenChoose(view: EditorView, more: string, label: string) {
  await labels(view);
  const pos = view.state.selection.main.head;
  view.dispatch({ changes: { from: pos, insert: more }, selection: { anchor: pos + more.length }, userEvent: 'input.type' });
  await new Promise(resolve => setTimeout(resolve, 100));
  accept(view, label);
}

/** Whether any source answers while typing (not an explicit request) at `|`, or at the end of `doc`. */
export async function offersWhileTyping(marked: string) {
  const cursor = marked.includes('|') ? marked.indexOf('|') : marked.length;
  const doc = marked.replace('|', '');
  const state = EditorState.create({ doc, extensions: [markdown()] });
  const context = new CompletionContext(state, cursor, false);
  const results = await Promise.all([...syntaxSources(host), ...frontMatterSources(host)].map(source => source(context)));
  return results.some(Boolean);
}

export const cursorLine = (view: EditorView) => view.state.doc.lineAt(view.state.selection.main.head).number;
