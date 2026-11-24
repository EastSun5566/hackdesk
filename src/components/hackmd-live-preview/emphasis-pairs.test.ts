import { closeBrackets } from '@codemirror/autocomplete';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';

import { emphasisPairSpace } from './emphasis-pairs';

afterEach(() => {
  document.body.innerHTML = '';
});

function setup(doc = '', extensions = [emphasisPairSpace]) {
  return new EditorView({
    parent: document.body.appendChild(document.createElement('div')),
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [
        markdown({ base: markdownLanguage }),
        markdownLanguage.data.of({ closeBrackets: { brackets: ['(', '[', '*', '_', '`'] } }),
        closeBrackets(),
        extensions,
      ],
    }),
  });
}

/** Types each character the way the DOM would: input handlers first, else a plain insertion. */
function type(view: EditorView, text: string) {
  for (const char of text) {
    const { from, to } = view.state.selection.main;
    const insert = () => view.state.update({
      changes: { from, to, insert: char },
      selection: { anchor: from + char.length },
      userEvent: 'input.type',
    });
    const handled = view.state.facet(EditorView.inputHandler).some((handler) => handler(view, from, to, char, insert));
    if (!handled) view.dispatch(insert());
  }
}

const show = (view: EditorView) => {
  const doc = view.state.doc.toString();
  const head = view.state.selection.main.head;
  return `${doc.slice(0, head)}|${doc.slice(head)}`;
};

describe('emphasis pairs', () => {
  it('starts a list item with * and a space, with no closer left to delete', () => {
    const view = setup();
    type(view, '* Item');
    expect(show(view)).toBe('* Item|');
  });

  it('pins the bug it fixes: without it, closeBrackets leaves a stray closer', () => {
    const view = setup('', []);
    type(view, '* Item');
    expect(show(view)).toBe('* Item|*');
  });

  it('still pairs * and _ around a word', () => {
    const view = setup('Some ');
    type(view, '*word');
    expect(show(view)).toBe('Some *word|*');
    type(view, '*');
    expect(show(view)).toBe('Some *word*|');

    const underscore = setup('Some ');
    type(underscore, '_word');
    expect(show(underscore)).toBe('Some _word|_');
  });

  it('drops the closer for a spaced operator, in a quote and in a nested list', () => {
    for (const [doc, typed, expected] of [
      ['2 ', '* 3', '2 * 3|'],
      ['> ', '* Quoted item', '> * Quoted item|'],
      ['- Parent\n  ', '* Child', '- Parent\n  * Child|'],
      ['Snake ', '_ case', 'Snake _ case|'],
    ] as const) {
      const view = setup(doc);
      type(view, typed);
      expect(show(view), typed).toBe(expected);
    }
  });

  it('leaves a space typed inside a bold pair or before more marks alone', () => {
    const bold = setup('**|**');
    bold.dispatch({ changes: { from: 0, to: 5, insert: '****' }, selection: { anchor: 2 } });
    type(bold, ' ');
    expect(show(bold)).toBe('** |**');

    const marks = setup('*');
    marks.dispatch({ changes: { from: 1, insert: '**' }, selection: { anchor: 1 } });
    type(marks, ' ');
    expect(show(marks)).toBe('* |**');
  });
});
