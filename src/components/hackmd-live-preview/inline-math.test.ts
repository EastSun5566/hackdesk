import { describe, expect, it } from 'vitest';

import { findInlineMath } from './inline-math';

describe('findInlineMath', () => {
  it('finds $…$ as inline math', () => {
    expect(findInlineMath('The Gamma function is $\\Gamma(n)$.')).toEqual([
      { from: 22, to: 33, source: '\\Gamma(n)', display: false },
    ]);
  });

  it('finds $$…$$ on one line as display math, not as $ around $…$', () => {
    expect(findInlineMath('$$E = mc^2$$')).toEqual([
      { from: 0, to: 12, source: 'E = mc^2', display: true },
    ]);
    expect(findInlineMath('Energy $$ E = mc^2 $$ and $x$.')).toEqual([
      { from: 7, to: 21, source: 'E = mc^2', display: true },
      { from: 26, to: 29, source: 'x', display: false },
    ]);
  });

  it('skips escaped, empty and spaced delimiters', () => {
    expect(findInlineMath('\\$$x$$')).toEqual([]);
    expect(findInlineMath('$$ $$ and $$')).toEqual([]);
    expect(findInlineMath('costs $5 and $6')).toEqual([]);
    expect(findInlineMath('a lone $$ opener')).toEqual([]);
  });
});
