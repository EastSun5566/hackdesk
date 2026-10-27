import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { noteEmbeds, type NoteEmbedHost } from './extension';

function setup(doc: string, describe: NoteEmbedHost['describe']) {
  const host = { describe: vi.fn(describe), open: vi.fn() };
  const view = new EditorView({
    parent: document.body.appendChild(document.createElement('div')),
    state: EditorState.create({ doc, extensions: [markdown(), noteEmbeds(host)] }),
  });
  return { view, host };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('note embed cards', () => {
  it('shows a card under each embed and preview line, keeping the source text', async () => {
    const { view, host } = setup('Intro\n{%hackmd @me/beta %}\n{%preview https://example.com %}\n`{%hackmd x %}` inline', async embed => (
      embed.kind === 'embed' ? { title: 'Beta plan', snippet: 'First\nline' } : null
    ));
    const cards = [...view.dom.querySelectorAll<HTMLElement>('.cm-note-embed')];
    expect(cards.map(card => card.dataset.embedKind)).toEqual(['embed', 'preview']);
    expect(view.state.doc.line(2).text).toBe('{%hackmd @me/beta %}');

    await vi.waitFor(() => expect(cards[0]?.querySelector('.cm-note-embed-title')?.textContent).toBe('Beta plan'));
    expect(cards[0]?.querySelector('.cm-note-embed-snippet')?.textContent).toBe('First line');
    // Nothing local knows the previewed page, so it shows the address.
    expect(cards[1]?.querySelector('.cm-note-embed-title')?.textContent).toBe('https://example.com');

    cards[0]?.querySelector('button')?.click();
    expect(host.open).toHaveBeenCalledWith({ kind: 'embed', ref: { kind: 'named', owner: 'me', slug: 'beta' }, raw: '@me/beta' });
  });

  it('leaves embed lines inside code as text', () => {
    const { view } = setup('```\n{%hackmd @me/beta %}\n```\n\n    {%preview https://example.com %}', async () => null);
    expect(view.dom.querySelector('.cm-note-embed')).toBeNull();
  });

  it('follows edits to the document', () => {
    const { view } = setup('Intro', async () => null);
    expect(view.dom.querySelector('.cm-note-embed')).toBeNull();
    view.dispatch({ changes: { from: 5, insert: '\n{%hackmd abc %}' } });
    expect(view.dom.querySelectorAll('.cm-note-embed')).toHaveLength(1);
  });
});
