import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { getOrderedListMarkerPreviews } from './list-markers';

function markerDisplays(markdown: string) {
  const state = EditorState.create({ doc: markdown });
  return [...getOrderedListMarkerPreviews(state).values()].map((marker) => marker.display);
}

describe('ordered list marker previews', () => {
  it('renders repeated one markers as sequential display numbers', () => {
    expect(markerDisplays([
      '1. First',
      '1. Second',
      '1. Third',
    ].join('\n'))).toEqual(['1.', '2.', '3.']);
  });

  it('continues numbering from the first explicit offset', () => {
    expect(markerDisplays([
      '57. foo',
      '1. bar',
      '1. baz',
    ].join('\n'))).toEqual(['57.', '58.', '59.']);
  });

  it('resets numbering after a blank line and tracks nested levels separately', () => {
    expect(markerDisplays([
      '1. Parent',
      '  1. Child',
      '  1. Child again',
      '1. Parent again',
      '',
      '1. Reset',
    ].join('\n'))).toEqual(['1.', '1.', '2.', '2.', '1.']);
  });
});
