import { describe, expect, it } from 'vitest';

import {
  getFenceFallback,
  getHfmBlockRanges,
  getHfmLineDecorations,
  getLineFallback,
  parseMarkdownImage,
} from './hfm-recognizers';

describe('HFM live-preview recognizers', () => {
  it('recognizes HackMD image size syntax without unsafe URL schemes', () => {
    expect(parseMarkdownImage('![Alt](https://example.com/a.png =320x180)', 42)).toEqual({
      alt: 'Alt',
      height: 180,
      lineTo: 42,
      src: 'https://example.com/a.png',
      width: 320,
    });
    expect(parseMarkdownImage('![bad](javascript:alert(1))', 10)).toBeNull();
    expect(parseMarkdownImage('![bad](data:image/png;base64,abc)', 10)).toBeNull();
  });

  it('recognizes fallback blocks for diagrams, csvpreview, math, and external embeds', () => {
    expect(getFenceFallback('```mermaid', 1)).toMatchObject({
      lineTo: 1,
      title: 'mermaid diagram block',
    });
    expect(getFenceFallback('```csvpreview {header="true"}', 2)).toMatchObject({
      lineTo: 2,
      title: 'CSV preview block',
    });
    expect(getFenceFallback('```javascript=101 [102-103]', 3)).toBeNull();
    expect(getLineFallback('$$', 4)).toMatchObject({
      lineTo: 4,
      title: 'MathJax block',
    });
    expect(getLineFallback('{%youtube 1G4isv_Fylg %}', 5)).toMatchObject({
      lineTo: 5,
      title: 'youtube embed',
    });
  });

  it('recognizes HFM line classes for alerts, containers, TOC, metadata, tables, and fences', () => {
    expect(getHfmLineDecorations('> [!warning]').lineClasses).toContain('cm-hackmd-alert cm-hackmd-alert-warning');
    expect(getHfmLineDecorations(':::danger').lineClasses).toContain('cm-hackmd-container cm-hackmd-container-danger');
    expect(getHfmLineDecorations('[TOC]').lineClasses).toContain('cm-hackmd-toc-line');
    expect(getHfmLineDecorations('[name=Michael] [time=Today]').lineClasses).toContain('cm-hackmd-blockquote-meta');
    expect(getHfmLineDecorations('| A | B |').lineClasses).toContain('cm-hackmd-table-line');
    expect(getHfmLineDecorations('---').lineClasses).not.toContain('cm-hackmd-table-line');
    expect(getHfmLineDecorations('```javascript=101 [102-103]').lineClasses).toContain('cm-hackmd-code-fence-options');
    expect(getHfmLineDecorations('```mermaid').lineClasses).toContain('cm-hackmd-hfm-fence cm-hackmd-hfm-fence-mermaid');
  });

  it('recognizes editable block ranges for containers and alerts', () => {
    expect(getHfmBlockRanges([
      'Intro',
      ':::info',
      ':bulb: Free users can upload images.',
      ':::',
      '',
      '> [!warning]',
      '> Pay attention.',
      'Done',
    ])).toEqual([
      {
        closerFrom: 0,
        closerLine: 4,
        closerTo: 3,
        endLine: 4,
        kind: 'container',
        openerFrom: 0,
        openerLine: 2,
        openerTo: 7,
        startLine: 2,
        variant: 'info',
      },
      {
        endLine: 7,
        kind: 'alert',
        openerFrom: 2,
        openerLine: 6,
        openerTo: 12,
        startLine: 6,
        variant: 'warning',
      },
    ]);
  });

  it('recognizes HFM inline marks as source offsets', () => {
    const marks = getHfmLineDecorations('{漢字|かんじ} ==mark== ++insert++ H ~2~ O x^2^ :smile:').inlineMarks;

    expect(marks.map((mark) => mark.className)).toEqual(expect.arrayContaining([
      'cm-hackmd-ruby',
      'cm-hackmd-mark',
      'cm-hackmd-insert',
      'cm-hackmd-subscript',
      'cm-hackmd-superscript',
      'cm-hackmd-emoji',
    ]));
    expect(marks.every((mark) => mark.to > mark.from)).toBe(true);
  });
});
