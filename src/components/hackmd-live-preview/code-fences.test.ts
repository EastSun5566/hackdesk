import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { getCodeFenceLineRole, getCodeFences } from './code-fences';

function fencesOf(doc: string) {
  const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
  return [...getCodeFences(state, ensureSyntaxTree(state, state.doc.length, 5000)!).values()];
}

describe('getCodeFences', () => {
  it('labels fences by language and finds their closing line', () => {
    expect(fencesOf('```js\na\n```\n\n```\nplain')).toEqual([
      { closed: true, endLine: 3, label: 'JavaScript', numbering: null, startLine: 1 },
      { closed: false, endLine: 6, label: '', numbering: null, startLine: 5 },
    ]);
  });

  it('numbers lines like HackMD, continuing =+ from the previous numbered fence', () => {
    const fences = fencesOf([
      '```js=', 'a', 'b', '```',
      '```py', 'c', '```',
      '```py=+', 'd', 'e', '```',
      '```txt=98', ...Array.from({ length: 5 }, () => 'x'), '```',
    ].join('\n'));
    expect(fences.map((fence) => fence.numbering)).toEqual([
      { first: 1, width: 1 },
      null,
      { first: 3, width: 1 },
      { first: 98, width: 3 },
    ]);
  });

  it('gives each line its role in the panel', () => {
    const [fence] = fencesOf('```js=7\na\nb\n```');
    expect([1, 2, 3, 4].map((line) => getCodeFenceLineRole(fence, line))).toEqual([
      { kind: 'header' },
      { kind: 'content', last: false, number: 7 },
      { kind: 'content', last: false, number: 8 },
      { kind: 'footer' },
    ]);
  });
});
