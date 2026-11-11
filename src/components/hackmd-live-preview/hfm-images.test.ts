import { describe, expect, it } from 'vitest';

import { getImageCaption, parseImageSize, parseMarkdownImage } from './hfm-images';

const parse = (line: string) => parseMarkdownImage(line, line.length);

describe('parseMarkdownImage', () => {
  it('follows the HackMD image size grammar', () => {
    expect(parse('![a](a.png =200x)')).toMatchObject({ width: { value: 200, unit: 'px' }, height: undefined });
    expect(parse('![a](a.png =x90)')).toMatchObject({ width: undefined, height: { value: 90, unit: 'px' } });
    expect(parse('![a](a.png =50%x)')).toMatchObject({ width: { value: 50, unit: '%' } });
    expect(parse('![a](a.png =200x100)')).toMatchObject({ width: { value: 200 }, height: { value: 100 } });
    expect(parse('![a](a.png =x)')).toMatchObject({ src: 'a.png', width: undefined, height: undefined });
  });

  it('rejects size forms HackMD does not render as images', () => {
    // No `x`, a unit, or the size before the title all break the image on HackMD.
    expect(parse('![a](a.png =200)')).toBeNull();
    expect(parse('![a](a.png =200pxx)')).toBeNull();
    expect(parse('![a](a.png =200x "Title")')).toBeNull();
    // Without a space before `=`, the size is part of the URL, as it is on HackMD.
    expect(parse('![a](a.png=200x)')).toMatchObject({ src: 'a.png=200x', width: undefined });
  });

  it('reads titles in every CommonMark quote style', () => {
    expect(parse('![a](a.png "Double")')?.title).toBe('Double');
    expect(parse("![a](a.png 'Single')")?.title).toBe('Single');
    expect(parse('![a](a.png (Paren))')?.title).toBe('Paren');
    expect(parse('![a](a.png "Say \\"hi\\"" =10x)')).toMatchObject({ title: 'Say "hi"', width: { value: 10 } });
  });

  it('keeps balanced parentheses in the source and unescapes alt text', () => {
    expect(parse('![a \\] b](https://en.wikipedia.org/wiki/Foo_(bar).png)')).toMatchObject({
      alt: 'a ] b',
      src: 'https://en.wikipedia.org/wiki/Foo_(bar).png',
    });
  });

  it('reports the line range of an indented image', () => {
    const line = '  ![a](a.png)';
    expect(parseMarkdownImage(line, 20)).toMatchObject({ lineFrom: 7, lineTo: 20 });
  });
});

describe('parseImageSize', () => {
  it('accepts positive pixel and percentage sizes only', () => {
    expect(parseImageSize('120')).toEqual({ value: 120, unit: 'px' });
    expect(parseImageSize('120px')).toEqual({ value: 120, unit: 'px' });
    expect(parseImageSize('33.5%')).toEqual({ value: 33.5, unit: '%' });
    expect(parseImageSize('0')).toBeUndefined();
    expect(parseImageSize('5%0')).toBeUndefined();
    expect(parseImageSize('')).toBeUndefined();
    expect(parseImageSize('1em')).toBeUndefined();
  });
});

describe('getImageCaption', () => {
  it('prefers the title, then descriptive alt text', () => {
    expect(getImageCaption({ alt: 'A mountain', title: 'Caption' })).toBe('Caption');
    expect(getImageCaption({ alt: 'A mountain at dusk' })).toBe('A mountain at dusk');
  });

  it('skips the alt text uploads and pastes leave behind', () => {
    for (const alt of ['image', 'Image', 'screenshot', 'IMG_0042.JPG', 'photo 2024.png', 'Uploading image 1a2b3c4d...', '']) {
      expect(getImageCaption({ alt }), alt).toBe('');
    }
  });
});
