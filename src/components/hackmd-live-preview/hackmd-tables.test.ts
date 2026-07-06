import { describe, expect, it } from 'vitest';

import { serializeTable, splitRowCells, type TableModel } from './hackmd-tables';

describe('HackMD table widget model helpers', () => {
  it('keeps empty cells and escaped pipes when splitting rows', () => {
    expect(splitRowCells('| A |  | escaped \\| pipe |')).toEqual([
      'A',
      '',
      'escaped \\| pipe',
    ]);
  });

  it('serializes uneven rows without dropping columns', () => {
    const model: TableModel = {
      header: ['Name', 'Value', 'Notes'],
      rows: [
        ['Alpha', '1'],
        ['Beta', '2', 'has | pipe'],
      ],
    };

    expect(serializeTable(model)).toBe([
      '| Name | Value | Notes |',
      '| --- | --- | --- |',
      '| Alpha | 1 |  |',
      '| Beta | 2 | has \\| pipe |',
    ].join('\n'));
  });
});
