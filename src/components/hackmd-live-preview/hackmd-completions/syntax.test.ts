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
import { afterEach, describe, expect, it, vi } from 'vitest';

import { hackmdCompletions } from '.';
import { syntaxSources } from './syntax';

function setup(doc: string, cursor = doc.length) {
  return new EditorView({
    parent: document.body.appendChild(document.createElement('div')),
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: [
        markdown(),
        closeBrackets(),
        hackmdCompletions({
          candidates: () => [{ title: 'Beta plan', detail: '@me/beta', link: 'https://hackmd.io/@me/beta', embedRef: '@me/beta' }],
          titleForUrl: async () => null,
        }),
      ],
    }),
  });
}

async function labels(view: EditorView) {
  startCompletion(view);
  await vi.waitFor(() => expect(currentCompletions(view.state).length).toBeGreaterThan(0));
  // Accepting is ignored until the menu has been open briefly (`interactionDelay`).
  await new Promise(resolve => setTimeout(resolve, 100));
  return currentCompletions(view.state).map(option => option.label);
}

async function choose(view: EditorView, label: string) {
  const index = (await labels(view)).indexOf(label);
  expect(index).toBeGreaterThanOrEqual(0);
  view.dispatch({ effects: setSelectedCompletion(index) });
  acceptCompletion(view);
}

/** Whether any source answers while typing (not an explicit request) at `|`, or at the end of `doc`. */
async function offersWhileTyping(marked: string) {
  const cursor = marked.includes('|') ? marked.indexOf('|') : marked.length;
  const doc = marked.replace('|', '');
  const state = EditorState.create({ doc, extensions: [markdown()] });
  const context = new CompletionContext(state, cursor, false);
  const results = await Promise.all(syntaxSources.map(source => source(context)));
  return results.some(Boolean);
}

const cursorLine = (view: EditorView) => view.state.doc.lineAt(view.state.selection.main.head).number;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('emoji completions', () => {
  it('lists emoji after a colon and two characters, and completes the shortcode', async () => {
    const view = setup('Great :smi');
    expect(await labels(view)).toContain(':smile:');
    await choose(view, ':smile:');
    expect(view.state.doc.toString()).toBe('Great :smile:');
  });

  it('stays quiet for times, web addresses, labels, one character, code and front matter', async () => {
    for (const doc of ['At 10:30', 'http://exam', '時間:10', 'note:ab', 'Hi :s', 'Use `:smi|`', '---\ntitle: x :smi|\n---', '```\n:smi']) {
      expect(await offersWhileTyping(doc), doc).toBe(false);
    }
    expect(await offersWhileTyping('(:smi')).toBe(true);
  });
});

describe('code block completions', () => {
  it('lists languages and diagrams, and closes a new block around an empty line', async () => {
    const view = setup('Intro\n\n```mer');
    const options = await labels(view);
    expect(options).toContain('mermaid');
    await choose(view, 'mermaid');
    expect(view.state.doc.toString()).toBe('Intro\n\n```mermaid\n\n```');
    expect(cursorLine(view)).toBe(4);

    const typescript = setup('```typ');
    await choose(typescript, 'typescript');
    expect(typescript.state.doc.toString()).toBe('```typescript\n\n```');
  });

  it('replaces fence characters closeBrackets typed after the cursor', async () => {
    const view = setup('```mer```', 6);
    await choose(view, 'mermaid');
    expect(view.state.doc.toString()).toBe('```mermaid\n\n```');
  });

  it('only changes the language of an existing block', async () => {
    const view = setup('```py\nprint(1)\n```', 5);
    await choose(view, 'python');
    expect(view.state.doc.toString()).toBe('```python\nprint(1)\n```');
  });

  it('stays quiet on a closing fence, and until a letter is typed', async () => {
    expect(await offersWhileTyping('```js\ncode\n```')).toBe(false);
    expect(await offersWhileTyping('Text\n\n```')).toBe(false);
    expect(await offersWhileTyping('Text\n\n```j')).toBe(true);
  });
});

describe('container completions', () => {
  it('lists container styles and closes a new container', async () => {
    const view = setup(':::wa');
    expect(await labels(view)).toEqual(['warning']);
    acceptCompletion(view);
    expect(view.state.doc.toString()).toBe(':::warning\n\n:::');
    expect(cursorLine(view)).toBe(2);
  });

  it('stays quiet on a closing ::: and inside code', async () => {
    expect(await offersWhileTyping(':::info\nText\n:::')).toBe(false);
    expect(await offersWhileTyping('```\n:::in')).toBe(false);
  });
});

describe('typing on while the list is open', () => {
  it('completes from where the typing ended, for containers, code blocks and embeds', async () => {
    for (const [doc, more, label, result] of [
      [':::wa', 'rn', 'warning', ':::warning\n\n:::'],
      ['```mer', 'ma', 'mermaid', '```mermaid\n\n```'],
      ['{%yo', 'ut', 'youtube', '{%youtube  %}'],
    ]) {
      const view = setup(doc!);
      expect(await labels(view)).toContain(label);
      // Still matches, so CodeMirror keeps the open list instead of asking the source again.
      view.dispatch({ changes: { from: doc!.length, insert: more! }, selection: { anchor: doc!.length + more!.length }, userEvent: 'input.type' });
      await new Promise(resolve => setTimeout(resolve, 100));
      const index = currentCompletions(view.state).findIndex(option => option.label === label);
      expect(index).toBeGreaterThanOrEqual(0);
      view.dispatch({ effects: setSelectedCompletion(index) });
      acceptCompletion(view);
      expect(view.state.doc.toString(), doc).toBe(result);
    }
  });
});

describe('embed completions', () => {
  it('lists embeds after {% and completes one with its closing marks', async () => {
    const view = setup('{%you}', 5);
    expect(await labels(view)).toEqual(['youtube']);
    acceptCompletion(view);
    expect(view.state.doc.toString()).toBe('{%youtube  %}');
    expect(view.state.selection.main.head).toBe('{%youtube '.length);
  });

  it('offers the notes to embed right after choosing hackmd', async () => {
    const view = setup('{%hack');
    await choose(view, 'hackmd');
    expect(view.state.doc.toString()).toBe('{%hackmd  %}');
    expect(await labels(view)).toEqual(['Beta plan']);
  });

  it('lists embeds only at the start of a line', async () => {
    expect(await offersWhileTyping('{%')).toBe(true);
    expect(await offersWhileTyping('See {%you')).toBe(false);
  });
});
