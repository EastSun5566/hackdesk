import { describe, expect, it } from 'vitest';

import { DEFAULT_SLIDE_OPTIONS, hasSlideType, parseSlides } from './slides';

const contents = (markdown: string) => parseSlides(markdown).stacks.map(stack => stack.map(slide => slide.content));

describe('parseSlides', () => {
  it('splits slides at --- and vertical slides at ---- with blank lines around them', () => {
    expect(contents([
      '# Intro',
      '',
      '---',
      '',
      '## Agenda',
      '',
      '----',
      '',
      '## Agenda, part 2',
      '',
      '---',
      '',
      '## Thanks',
    ].join('\n'))).toEqual([
      ['# Intro'],
      ['## Agenda', '## Agenda, part 2'],
      ['## Thanks'],
    ]);
  });

  it('keeps --- without blank lines around it as a rule, and reads CRLF and CR line endings', () => {
    expect(contents('one\n---\ntwo\n\n---\nthree')).toEqual([['one\n---\ntwo\n\n---\nthree']]);
    expect(contents('one\r\n\r\n---\r\n\r\ntwo')).toEqual([['one'], ['two']]);
    expect(contents('one\r\r---\r\rtwo')).toEqual([['one'], ['two']]);
    expect(contents('one\n\n---\n')).toEqual([['one'], ['']]);
    // As in HackMD, splitting is by line alone, even inside code.
    expect(contents('```yaml\n\n---\n\n```')).toEqual([['```yaml'], ['```']]);
  });

  it('reads the front matter without splitting at its fences', () => {
    const deck = parseSlides([
      '---',
      'title: Quarterly review',
      'lang: zh-TW',
      'dir: rtl',
      'breaks: false',
      'slideOptions:',
      '  theme: solarized',
      '  transition: fade',
      '  controls: false',
      '  dependencies:',
      '    - src: https://example.com/evil.js',
      '  plugins: [Evil]',
      '---',
      '',
      '# First',
    ].join('\n'));

    expect(deck).toMatchObject({ title: 'Quarterly review', theme: 'solarized', lang: 'zh-TW', rtl: true, breaks: false });
    expect(deck.options).toEqual({ ...DEFAULT_SLIDE_OPTIONS, transition: 'fade', controls: false, rtl: true });
    expect(contents('---\ntitle: x\n---\n\n# First')).toEqual([['# First']]);
  });

  it('reads slideOptions written as a JSON or YAML string, and ignores ones it cannot read', () => {
    expect(parseSlides('---\nslideOptions: \'{"theme": "white", "progress": false}\'\n---\n').options)
      .toMatchObject({ progress: false });
    expect(parseSlides('---\nslideOptions: "theme: white"\n---\n').theme).toBe('white');
    expect(parseSlides('---\nslideOptions: "{oops"\n---\n').options).toEqual({ ...DEFAULT_SLIDE_OPTIONS, rtl: false });
    expect(parseSlides('---\n: : bad yaml\n---\n# Still here').stacks).toEqual([[{ content: '# Still here', notes: '' }]]);
  });

  it('uses the black theme unless the note names a built-in one', () => {
    expect(parseSlides('# Plain').theme).toBe('black');
    expect(parseSlides('---\nslideOptions:\n  theme: ../../evil\n---\n').theme).toBe('black');
  });

  it('takes the title from the front matter, then the first heading', () => {
    expect(parseSlides('Intro\n\n# Welcome\n\n---\n\n# Next').title).toBe('Welcome');
    expect(parseSlides('No heading').title).toBeNull();
  });

  it('starts speaker notes at the first note: line outside code and ::: blocks', () => {
    const [[slide]] = parseSlides([
      '## Demo',
      '```',
      'note: inside code',
      '```',
      ':::info',
      'Note: inside a container',
      ':::',
      'NOTE: Say hello',
      'and wave',
    ].join('\n')).stacks;
    expect(slide).toEqual({
      content: '## Demo\n```\nnote: inside code\n```\n:::info\nNote: inside a container\n:::',
      notes: 'Say hello\nand wave',
    });
  });
});

describe('hasSlideType', () => {
  it('is true when the front matter says type: slide', () => {
    expect(hasSlideType('---\ntitle: Deck\ntype: slide\n---\n# Deck')).toBe(true);
    expect(hasSlideType('---\ntype: "slide"\n---\n')).toBe(true);
    expect(hasSlideType('# Deck\n\ntype: slide')).toBe(false);
  });
});
