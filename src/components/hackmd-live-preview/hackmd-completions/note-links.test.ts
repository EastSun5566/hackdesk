import { acceptCompletion, currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { NoteLinkCandidate } from '@/components/markdown-editor-types';

import { hackmdCompletions } from '.';
import type { NoteLinksHost } from './note-links';

const candidates: NoteLinkCandidate[] = [
  { title: 'Beta plan', detail: '@me/beta', link: 'https://hackmd.io/@me/beta', embedRef: '@me/beta' },
  { title: 'Gamma', detail: 'gamma.md', link: './gamma.md', embedRef: null },
];

function setup(doc: string, host: Partial<NoteLinksHost> = {}) {
  const view = new EditorView({
    parent: document.body.appendChild(document.createElement('div')),
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [markdown(), hackmdCompletions({ candidates: () => candidates, titleForUrl: async () => null, ...host })],
    }),
  });
  return view;
}

async function complete(view: EditorView) {
  startCompletion(view);
  await vi.waitFor(() => expect(currentCompletions(view.state).length).toBeGreaterThan(0));
  // Accepting is ignored until the menu has been open briefly (`interactionDelay`).
  await new Promise(resolve => setTimeout(resolve, 100));
  return currentCompletions(view.state).map(option => option.label);
}

/** Lets a source that should stay quiet answer, then reports what it offered. */
async function offered(view: EditorView) {
  startCompletion(view);
  await new Promise(resolve => setTimeout(resolve, 50));
  return currentCompletions(view.state).map(option => option.label);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('note link completions', () => {
  it('searches notes after `[text](` by what is typed, or by the link text, and closes the link', async () => {
    const view = setup('See [gam](');
    expect(await complete(view)).toEqual(['Gamma']);
    acceptCompletion(view);
    expect(view.state.doc.toString()).toBe('See [gam](./gamma.md)');
    expect(view.state.selection.main.head).toBe(view.state.doc.length);

    const typed = setup('See [x](bet)');
    typed.dispatch({ selection: { anchor: 'See [x](bet'.length } });
    expect(await complete(typed)).toEqual(['Beta plan']);
    acceptCompletion(typed);
    expect(typed.state.doc.toString()).toBe('See [x](https://hackmd.io/@me/beta)');
  });

  it('stays out of images, web addresses, and code', async () => {
    expect(await offered(setup('![gam]('))).toEqual([]);
    expect(await offered(setup('[gam](https:'))).toEqual([]);
    expect(await offered(setup('```\n[gam]('))).toEqual([]);
  });

  it('lists embeddable notes after `{%hackmd ` and closes the tag', async () => {
    const view = setup('{%hackmd ');
    expect(await complete(view)).toEqual(['Beta plan']);
    acceptCompletion(view);
    expect(view.state.doc.toString()).toBe('{%hackmd @me/beta %}');
  });

  it('offers URL, Reference, and Preview right after a URL is pasted', async () => {
    const view = setup('Read ', { titleForUrl: async () => 'Beta [plan]' });
    const url = 'https://hackmd.io/@me/beta';
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: (type: string) => (type === 'text/plain' ? url : '') } });
    view.contentDOM.dispatchEvent(paste);
    expect(view.state.doc.toString()).toBe(`Read ${url}`);

    await vi.waitFor(() => expect(currentCompletions(view.state).map(option => option.label)).toEqual(['URL', 'Reference', 'Preview']));
    expect(currentCompletions(view.state)[1]?.detail).toBe('[Beta [plan]](…)');
  });
});
