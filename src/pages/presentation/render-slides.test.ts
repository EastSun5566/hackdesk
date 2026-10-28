import { describe, expect, it } from 'vitest';

import { parseSlides } from '@/lib/slides';

import { renderSlides } from './render-slides';

const render = (markdown: string) => renderSlides(parseSlides(markdown));

describe('renderSlides', () => {
  it('renders one section per slide, nesting vertical slides', () => {
    const sections = render('# One\n\n---\n\n## Two\n\n----\n\n## Two, below');
    expect(sections.map(section => section.tagName)).toEqual(['SECTION', 'SECTION']);
    expect(sections[0]!.querySelector('h1')?.textContent).toBe('One');
    expect([...sections[1]!.children].map(child => child.textContent?.trim())).toEqual(['Two', 'Two, below']);
  });

  it('sets allowed attributes from .slide: and .element: comments', () => {
    const [section] = render([
      '<!-- .slide: data-background="#123456" data-transition="zoom" onclick="alert(1)" -->',
      '## Steps',
      '- First <!-- .element: class="fragment" data-fragment-index="2" -->',
      '',
      '![Chart](https://example.com/chart.png) <!-- .element: style="width: 50%" id="chart" title="nope" -->',
    ].join('\n'));

    expect(section!.dataset).toMatchObject({ background: '#123456', transition: 'zoom' });
    expect(section!.hasAttribute('onclick')).toBe(false);
    expect(section!.querySelector('li')?.className).toBe('fragment');
    expect(section!.querySelector('li')?.dataset.fragmentIndex).toBe('2');
    const image = section!.querySelector('img')!;
    expect([image.id, image.getAttribute('style'), image.hasAttribute('title')]).toEqual(['chart', 'width: 50%', false]);
    expect(section!.innerHTML).not.toContain('<!--');
  });

  it('removes scripts, event handlers, frames, and frame-loading reveal.js attributes', () => {
    const [section] = render([
      '<script>alert(1)</script>',
      '<img src="x" onerror="alert(1)">',
      '<iframe src="https://example.com"></iframe>',
      '<!-- .slide: data-background-iframe="https://example.com" -->',
      '<a href="https://example.com" data-preview-link>Site</a>',
    ].join('\n'));

    expect(section!.querySelector('script, iframe, [onerror], [data-preview-link]')).toBeNull();
    expect(section!.hasAttribute('data-background-iframe')).toBe(false);
  });

  it('opens web links in the browser', () => {
    const [section] = render('[Docs](https://example.com/docs) and <a href="#/2">slide 2</a>');
    const [web, internal] = section!.querySelectorAll('a');
    expect([web!.target, web!.rel]).toEqual(['_blank', 'noopener noreferrer']);
    expect(internal!.hasAttribute('target')).toBe(false);
  });

  it('renders inline and block math, but not prices', () => {
    const [section] = render('Euler: $e^{i\\pi} + 1 = 0$ costs $5 and $10\n\n$$\n\\sum_{n=1}^{\\infty} n\n$$');
    expect(section!.querySelectorAll('.katex')).toHaveLength(2);
    expect(section!.querySelector('.katex-display')).not.toBeNull();
    expect(section!.textContent).toContain('costs $5 and $10');
  });

  it('passes code languages, line numbers, and highlighted lines to the highlighter', () => {
    const [section] = render([
      '```js=10 [1,3|4]',
      'const html = "<b>";',
      '```',
      '',
      '```python=',
      'print(1)',
      '```',
      '',
      '```',
      'plain',
      '```',
    ].join('\n'));
    const [numbered, plainNumbers, plain] = section!.querySelectorAll('pre code');
    expect(numbered!.className).toBe('language-js');
    expect(numbered!.getAttribute('data-line-numbers')).toBe('1,3|4');
    expect(numbered!.getAttribute('data-ln-start-from')).toBe('10');
    expect(numbered!.textContent).toBe('const html = "<b>";\n');
    expect(plainNumbers!.getAttribute('data-line-numbers')).toBe('');
    expect(plain!.hasAttribute('class') || plain!.hasAttribute('data-line-numbers')).toBe(false);
  });

  it('keeps speaker notes in a hidden aside', () => {
    const [section] = render('## Hello\n\nnote: Smile **first**');
    expect(section!.querySelector('aside.notes')?.innerHTML).toContain('<strong>first</strong>');
  });

  it('turns single newlines into line breaks unless the deck turns them off', () => {
    expect(render('a\nb')[0]!.querySelector('br')).not.toBeNull();
    expect(render('---\nbreaks: false\n---\na\nb')[0]!.querySelector('br')).toBeNull();
  });
});
