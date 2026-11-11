import { describe, expect, it } from 'vitest';

import { parseHtmlImage, parseImageLine } from './hfm-images';
import { getInlineHtmlDecorations, getSafeStyle } from './inline-html';

function render(line: string) {
  const { hidden, marks } = getInlineHtmlDecorations(line);
  return {
    hidden: hidden.map((range) => line.slice(range.from, range.to) + (range.widget ? ` (${range.widget})` : '')),
    marks: marks.map((mark) => ({ text: line.slice(mark.from, mark.to), className: mark.className, attributes: mark.attributes })),
  };
}

describe('getInlineHtmlDecorations', () => {
  it('formats the contents of allowlisted tags and hides the tags', () => {
    expect(render('Press <kbd>Cmd</kbd>, H<sub>2</sub>O, <mark>hi</mark>')).toEqual({
      hidden: ['<kbd>', '</kbd>', '<sub>', '</sub>', '<mark>', '</mark>'],
      marks: [
        { text: 'Cmd', className: 'cm-hackmd-html-kbd', attributes: undefined },
        { text: '2', className: 'cm-hackmd-subscript', attributes: undefined },
        { text: 'hi', className: 'cm-hackmd-mark', attributes: undefined },
      ],
    });
  });

  it('pairs nested tags and leaves unclosed or unknown tags as source', () => {
    expect(render('<b>bold <i>both</i></b> <b>open <foo>x</foo>').marks.map((mark) => mark.text)).toEqual(['both', 'bold <i>both</i>']);
    expect(render('<script>alert(1)</script>')).toEqual({ hidden: [], marks: [] });
  });

  it('keeps only safe colours from style and a title on abbr', () => {
    const { marks } = render('<span style="color: #d14; position: fixed" onclick="x()">a</span><abbr title="Hyper Text" class="x">HT</abbr>');
    expect(marks.map((mark) => mark.attributes)).toEqual([{ style: 'color: #d14' }, { title: 'Hyper Text' }]);
  });

  it('marks line breaks and summary disclosures, and hides structural tags on their own line', () => {
    expect(render('a<br>b<br/>c').hidden).toEqual(['<br> (line-break)', '<br/> (line-break)']);
    expect(render('<summary>More</summary>').hidden).toEqual(['<summary> (disclosure)', '</summary>']);
    expect(render('<details>').hidden).toEqual(['<details>']);
    expect(render('text <details>').hidden).toEqual([]);
  });

  it('ignores tags inside code spans', () => {
    const line = '`<kbd>x</kbd>` <kbd>y</kbd>';
    const { marks } = getInlineHtmlDecorations(line, [{ from: 0, to: 14 }]);
    expect(marks.map((mark) => line.slice(mark.from, mark.to))).toEqual(['y']);
  });
});

describe('getSafeStyle', () => {
  it('passes plain colour values and drops everything else', () => {
    expect(getSafeStyle('color: red; background: rgb(1, 2, 3)')).toBe('color: red; background-color: rgb(1, 2, 3)');
    expect(getSafeStyle('color: url(javascript:x); background-color: expression(alert(1))')).toBe('');
    expect(getSafeStyle('display: none; font-size: 99px')).toBe('');
    expect(getSafeStyle('color: #12345678')).toBe('color: #12345678');
  });
});

describe('parseHtmlImage', () => {
  it('reads the attributes HackMD keeps on an image', () => {
    expect(parseHtmlImage('<img src="a b.png" width="160" height=90 alt=\'Alt &amp; more\' onerror="x()">', 80)).toMatchObject({
      src: 'a b.png', alt: 'Alt & more', width: { value: 160, unit: 'px' }, height: { value: 90, unit: 'px' },
    });
    expect(parseHtmlImage('<img src="a.png" width="50%" />', 20)?.width).toEqual({ value: 50, unit: '%' });
  });

  it('rejects unsafe sources and lines with more than the image', () => {
    expect(parseHtmlImage('<img src="javascript:alert(1)">', 10)).toBeNull();
    expect(parseHtmlImage('<img alt="no source">', 10)).toBeNull();
    expect(parseHtmlImage('see <img src="a.png">', 10)).toBeNull();
    expect(parseImageLine('<img src="a.png">', 17)?.src).toBe('a.png');
  });
});
