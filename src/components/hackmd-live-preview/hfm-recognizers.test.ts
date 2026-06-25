import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  getHfmBlockRanges,
  getHfmLineDecorations,
  parseMarkdownImage,
} from './hfm-recognizers';

describe('HFM live-preview recognizers', () => {
  it('keeps HFM live preview independent from removed reader renderer packages', () => {
    const packageJson = readFileSync(`${process.cwd()}/package.json`, 'utf8');

    expect(packageJson).not.toContain('"markdown-it"');
    expect(packageJson).not.toContain('"shiki"');
    expect(packageJson).not.toContain('electron-markdown-renderer');
  });

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

  it('recognizes every HackMD rich fence and external provider as low-noise source styling', () => {
    expect([
      'sequence',
      'flow',
      'graphviz',
      'mermaid',
      'abc',
      'plantuml',
      'vega',
      'fretboard',
    ].map((language) => getHfmLineDecorations(`\`\`\`${language} {title="demo"}`).lineClasses)).toEqual([
      expect.arrayContaining(['cm-hackmd-hfm-fence cm-hackmd-hfm-fence-sequence']),
      expect.arrayContaining(['cm-hackmd-hfm-fence cm-hackmd-hfm-fence-flow']),
      expect.arrayContaining(['cm-hackmd-hfm-fence cm-hackmd-hfm-fence-graphviz']),
      expect.arrayContaining(['cm-hackmd-hfm-fence cm-hackmd-hfm-fence-mermaid']),
      expect.arrayContaining(['cm-hackmd-hfm-fence cm-hackmd-hfm-fence-abc']),
      expect.arrayContaining(['cm-hackmd-hfm-fence cm-hackmd-hfm-fence-plantuml']),
      expect.arrayContaining(['cm-hackmd-hfm-fence cm-hackmd-hfm-fence-vega']),
      expect.arrayContaining(['cm-hackmd-hfm-fence cm-hackmd-hfm-fence-fretboard']),
    ]);

    expect([
      '{%vimeo 124148255 %}',
      '{%gist schacon/4277 %}',
      '{%slideshare deck %}',
      '{%speakerdeck deck %}',
      '{%pdf https://hackmd.io/pdf-sample.pdf %}',
      '{%figma https://figma.com/file/example %}',
    ].map((line) => getHfmLineDecorations(line).lineClasses)).toEqual([
      expect.arrayContaining(['cm-hackmd-external-line cm-hackmd-external-vimeo']),
      expect.arrayContaining(['cm-hackmd-external-line cm-hackmd-external-gist']),
      expect.arrayContaining(['cm-hackmd-external-line cm-hackmd-external-slideshare']),
      expect.arrayContaining(['cm-hackmd-external-line cm-hackmd-external-speakerdeck']),
      expect.arrayContaining(['cm-hackmd-external-line cm-hackmd-external-pdf']),
      expect.arrayContaining(['cm-hackmd-external-line cm-hackmd-external-figma']),
    ]);

    expect(getHfmLineDecorations('```javascript=101 [102-103]').lineClasses).not.toContain('cm-hackmd-hfm-fence');
    expect(getHfmLineDecorations('$$').lineClasses).toContain('cm-hackmd-math-block-line');
  });

  it('recognizes HFM line classes for alerts, containers, TOC, metadata, tables, and fences', () => {
    expect(getHfmLineDecorations('> [!warning]').lineClasses).toContain('cm-hackmd-alert cm-hackmd-alert-warning');
    expect(getHfmLineDecorations(':::danger').lineClasses).toContain('cm-hackmd-container cm-hackmd-container-danger');
    expect(getHfmLineDecorations('[TOC]').lineClasses).toContain('cm-hackmd-toc-line');
    expect(getHfmLineDecorations('[name=Michael] [time=Today]').lineClasses).toContain('cm-hackmd-blockquote-meta');
    expect(getHfmLineDecorations('> [name=Michael] [time=Today] [color=#907bf7]').lineClasses).toContain('cm-hackmd-blockquote-meta');
    expect(getHfmLineDecorations('| A | B |').lineClasses).toContain('cm-hackmd-table-line');
    expect(getHfmLineDecorations('---').lineClasses).not.toContain('cm-hackmd-table-line');
    expect(getHfmLineDecorations('```javascript=101 [102-103]').lineClasses).toContain('cm-hackmd-code-fence-options');
    expect(getHfmLineDecorations('```mermaid').lineClasses).toContain('cm-hackmd-hfm-fence cm-hackmd-hfm-fence-mermaid');
    expect(getHfmLineDecorations('    indented code').lineClasses).toContain('cm-hackmd-indented-code');
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

  it('recognizes table and blockquote metadata blocks without treating them as rendered HTML', () => {
    expect(getHfmBlockRanges([
      'Intro',
      '| Option | Description |',
      '| :----- | ----------: |',
      '| data | path |',
      '',
      '> [name=Michael] [time=Today] [color=#907bf7]',
      '> Quote body.',
    ])).toEqual(expect.arrayContaining([
      expect.objectContaining({
        endLine: 4,
        kind: 'table',
        openerLine: 2,
        startLine: 2,
        variant: 'table',
      }),
      expect.objectContaining({
        endLine: 7,
        kind: 'blockquote-meta',
        openerLine: 6,
        startLine: 6,
        variant: 'meta',
      }),
    ]));
  });

  it('recognizes HFM inline marks as source offsets', () => {
    const marks = getHfmLineDecorations('{漢字|かんじ} ==mark== ++insert++ H ~2~ O x^2^ :smile: $x+1$ ^[inline footnote] [ref][id] ![img][id] https://hackmd.io <i class="fa fa-pencil"></i> (tm) -- "quote"').inlineMarks;

    expect(marks.map((mark) => mark.className)).toEqual(expect.arrayContaining([
      'cm-hackmd-ruby',
      'cm-hackmd-mark',
      'cm-hackmd-insert',
      'cm-hackmd-subscript',
      'cm-hackmd-superscript',
      'cm-hackmd-emoji',
      'cm-hackmd-inline-math',
      'cm-hackmd-inline-footnote',
      'cm-hackmd-reference-link',
      'cm-hackmd-autolink',
      'cm-hackmd-raw-html',
      'cm-hackmd-typographer',
    ]));
    expect(marks.every((mark) => mark.to > mark.from)).toBe(true);
  });

  it('recognizes CSV and spoiler metadata as editable source marks', () => {
    expect(getHfmLineDecorations('```csvpreview {header="true" delimiter="."}').inlineMarks).toEqual(expect.arrayContaining([
      expect.objectContaining({ className: 'cm-hackmd-fence-meta' }),
    ]));
    expect(getHfmLineDecorations(':::spoiler {state="open"} Details').inlineMarks).toEqual(expect.arrayContaining([
      expect.objectContaining({ className: 'cm-hackmd-container-meta' }),
    ]));
  });

  it('returns inactive-only hidden ranges for HackMD blockquote metadata', () => {
    const metadata = '> [name=Michael] [time=Today]';

    expect(getHfmLineDecorations(metadata).hiddenRanges).toEqual([
      {
        from: 2,
        to: metadata.length,
      },
    ]);
    expect(getHfmLineDecorations('Normal text').hiddenRanges).toEqual([]);
  });
});
