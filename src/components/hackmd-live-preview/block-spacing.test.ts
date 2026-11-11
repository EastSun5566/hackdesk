import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { getPanelSpacerPositions } from './block-spacing';

function spacersOf(lines: string[]) {
  const state = EditorState.create({ doc: lines.join('\n'), extensions: [markdown({ base: markdownLanguage })] });
  const { after, before } = getPanelSpacerPositions(state);
  const at = (position: number) => state.doc.lineAt(position).number;
  return { above: before.map(at), below: after.map(at) };
}

describe('getPanelSpacerPositions', () => {
  it('spaces panels from touching lines, with one gap between touching panels', () => {
    expect(spacersOf([
      '## Green', //   1
      '```', //        2
      ':::success', // 3 (code, not a container)
      ':::', //        4
      '```', //        5
      ':::success', // 6
      'Yay', //        7
      ':::', //        8
      'After', //      9
    ])).toEqual({ above: [2, 6], below: [8] });
  });

  it('adds nothing where a blank line already separates the panel', () => {
    expect(spacersOf(['Intro', '', '```js', 'a', '```', '', 'Outro'])).toEqual({ above: [], below: [] });
  });

  it('spaces blockquotes and alerts from touching lines', () => {
    expect(spacersOf([
      'Intro', //         1
      '> quote', //       2
      '> more', //        3
      '> [!NOTE]', //     4 (still the same quote)
    ])).toEqual({ above: [2], below: [] });
    expect(spacersOf(['## Note', '> [!NOTE]', '> Text', 'Lazy continuation stays in the quote', '', 'Next'])).toEqual({ above: [2], below: [] });
    expect(spacersOf(['> quote', '```', 'code', '```'])).toEqual({ above: [2], below: [] });
  });

  it('leaves fences inside a container alone', () => {
    expect(spacersOf([':::info', '```', 'a', '```', ':::'])).toEqual({ above: [], below: [] });
  });
});
