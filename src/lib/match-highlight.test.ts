import { describe, expect, it } from 'vitest';

import { findMatchRanges } from './match-highlight';

const marked = (text: string, query: string, options?: { acronym?: boolean }) => findMatchRanges(text, query, options)
  .map(([start, end]) => text.slice(start, end));

describe('findMatchRanges', () => {
  it('marks the whole query, ignoring case, including Chinese', () => {
    expect(findMatchRanges('Split Pane Right', 'pane')).toEqual([[6, 10]]);
    expect(marked('產品週會紀錄', '週會')).toEqual(['週會']);
    expect(findMatchRanges('New Note', '  ')).toEqual([]);
  });

  it('marks every word of a query with spaces, or nothing when one is missing', () => {
    expect(marked('Close Tabs to Right', 'right close')).toEqual(['Close', 'Right']);
    expect(findMatchRanges('Close Tabs to Right', 'tab tabs')).toEqual([[6, 10]]);
    expect(findMatchRanges('Close Tabs to Right', 'close left')).toEqual([]);
  });

  it('marks letters that start words or follow one another', () => {
    expect(marked('New Note', 'nn')).toEqual(['N', 'N']);
    expect(marked('Close Tabs to Right', 'ctr')).toEqual(['C', 'T', 'R']);
    expect(marked('New Note', 'newno')).toEqual(['New', 'No']);
    expect(marked('openNoteWebEditor', 'onw')).toEqual(['o', 'N', 'W']);
    expect(marked('Use Theme: Solarized', 'uts')).toEqual(['U', 'T', 'S']);
  });

  it('leaves looser matches unmarked', () => {
    // Letters inside words, and typos, do not count.
    expect(findMatchRanges('Toggle Theme', 'ogt')).toEqual([]);
    expect(findMatchRanges('Settings', 'setitngs')).toEqual([]);
    expect(findMatchRanges('New Note', 'nn', { acronym: false })).toEqual([]);
  });
});
