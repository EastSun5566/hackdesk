import { insertNewlineContinueMarkup, markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorSelection, EditorState, type StateCommand } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { toggleMarkdownWrap } from './quick-capture-markdown';

function run(command: StateCommand, doc: string, from: number, to = from) {
  let state = EditorState.create({
    doc,
    selection: EditorSelection.single(from, to),
    extensions: markdown({ base: markdownLanguage }),
  });
  command({ state, dispatch: (transaction) => { state = transaction.state; } });
  const { main } = state.selection;
  return { doc: state.doc.toString(), selected: state.sliceDoc(main.from, main.to), cursor: main.head };
}

describe('Quick Hack markdown commands', () => {
  it('wraps a selection in bold and unwraps it again', () => {
    expect(run(toggleMarkdownWrap('**'), 'make this bold', 5, 9)).toEqual({ doc: 'make **this** bold', selected: 'this', cursor: 11 });
    expect(run(toggleMarkdownWrap('**'), 'make **this** bold', 7, 11)).toMatchObject({ doc: 'make this bold', selected: 'this' });
    expect(run(toggleMarkdownWrap('**'), 'make **this** bold', 5, 13)).toMatchObject({ doc: 'make this bold', selected: 'this' });
  });

  it('inserts a marker pair around the cursor with nothing selected', () => {
    expect(run(toggleMarkdownWrap('*'), 'a  b', 2)).toEqual({ doc: 'a ** b', selected: '', cursor: 3 });
  });

  it('italicises bold text instead of mistaking it for italic', () => {
    expect(run(toggleMarkdownWrap('*'), '**bold**', 2, 6)).toMatchObject({ doc: '***bold***', selected: 'bold' });
    expect(run(toggleMarkdownWrap('*'), '*it*', 1, 3)).toMatchObject({ doc: 'it', selected: 'it' });
  });

  it('continues lists and task lists on Enter', () => {
    expect(run(insertNewlineContinueMarkup, '- first', 7).doc).toBe('- first\n- ');
    expect(run(insertNewlineContinueMarkup, '- [ ] todo', 10).doc).toBe('- [ ] todo\n- [ ] ');
    expect(run(insertNewlineContinueMarkup, '1. one', 6).doc).toBe('1. one\n2. ');
  });
});
