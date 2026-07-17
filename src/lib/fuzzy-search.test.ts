import { describe, expect, it } from 'vitest';

import { fuzzySearch } from './fuzzy-search';

const options = {
  primary: (item: { label: string; keywords?: string[] }) => item.label,
  secondary: (item: { label: string; keywords?: string[] }) => item.keywords,
};

describe('fuzzySearch', () => {
  it('keeps exact, prefix, substring, and metadata matches ahead of fuzzy matches', () => {
    const items = [
      { label: 'Alpah Notes' },
      { label: 'Other', keywords: ['alpha'] },
      { label: 'Team Alpha Notes' },
      { label: 'Alpha Plan' },
      { label: 'Alpha' },
    ];

    expect(fuzzySearch(items, 'alpha', options).map((item) => item.label)).toEqual([
      'Alpha',
      'Alpha Plan',
      'Team Alpha Notes',
      'Other',
      'Alpah Notes',
    ]);
  });

  it('matches missing letters and adjacent transpositions', () => {
    const items = [
      { label: 'Open Settings' },
      { label: 'Switch to Local Vault', keywords: ['vault'] },
    ];

    expect(fuzzySearch(items, 'setings', options).map((item) => item.label)).toEqual(['Open Settings']);
    expect(fuzzySearch(items, 'vualt', options).map((item) => item.label)).toEqual(['Switch to Local Vault']);
  });

  it('does not fuzzy-match blank, one-character, or unrelated queries', () => {
    const items = [{ label: 'Settings' }, { label: 'Vault' }];

    expect(fuzzySearch(items, '', options)).toBe(items);
    expect(fuzzySearch(items, 's', options).map((item) => item.label)).toEqual(['Settings']);
    expect(fuzzySearch(items, 'x', options)).toEqual([]);
    expect(fuzzySearch(items, 'unrelated', options)).toEqual([]);
  });

  it('keeps multi-word command searches literal to avoid noisy results', () => {
    const items = [{ label: 'New Note' }, { label: 'New Folder' }];

    expect(fuzzySearch(items, 'new note', options).map((item) => item.label)).toEqual(['New Note']);
  });
});
