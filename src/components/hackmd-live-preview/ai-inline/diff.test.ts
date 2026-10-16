import { describe, expect, it } from 'vitest';

import { diffWords, tokenize, type DiffPart } from './diff';

function join(parts: DiffPart[], keep: DiffPart['type']) {
  return parts.filter(part => part.type === 'equal' || part.type === keep).map(part => part.text).join('');
}

describe('diffWords', () => {
  it('marks only the changed words and keeps both texts recoverable', () => {
    const before = 'This are a excelent editor.';
    const after = 'This is an excellent editor.';
    const parts = diffWords(before, after);
    expect(join(parts, 'delete')).toBe(before);
    expect(join(parts, 'insert')).toBe(after);
    expect(parts.filter(part => part.type === 'delete').map(part => part.text.trim())).toEqual(['are a excelent']);
    expect(parts.at(-1)).toEqual({ type: 'equal', text: ' editor.' });
  });

  it('splits CJK text per character so a one-character fix stays small', () => {
    expect(tokenize('今天天氣好 ok')).toEqual(['今', '天', '天', '氣', '好', ' ', 'ok']);
    const parts = diffWords('我今天很開新', '我今天很開心');
    expect(parts).toEqual([
      { type: 'equal', text: '我今天很開' },
      { type: 'delete', text: '新' },
      { type: 'insert', text: '心' },
    ]);
  });

  it('handles pure insertions, pure deletions and identical text', () => {
    expect(diffWords('a c', 'a b c')).toEqual([{ type: 'equal', text: 'a ' }, { type: 'insert', text: 'b ' }, { type: 'equal', text: 'c' }]);
    expect(diffWords('a b c', 'a c')).toEqual([{ type: 'equal', text: 'a ' }, { type: 'delete', text: 'b ' }, { type: 'equal', text: 'c' }]);
    expect(diffWords('same', 'same')).toEqual([{ type: 'equal', text: 'same' }]);
    expect(diffWords('', 'new')).toEqual([{ type: 'insert', text: 'new' }]);
  });

  it('shows a very long change whole instead of building a huge table', () => {
    const before = Array.from({ length: 4_000 }, (_, index) => `a${index}`).join(' ');
    const after = Array.from({ length: 4_000 }, (_, index) => `b${index}`).join(' ');
    const parts = diffWords(before, after);
    expect(parts.map(part => part.type)).toEqual(['delete', 'insert']);
  });
});
