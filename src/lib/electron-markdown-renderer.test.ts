import { describe, expect, it } from 'vitest';

import { renderHackmdMarkdown } from './electron-markdown-renderer';

describe('HackMD-flavored markdown renderer', () => {
  it('renders common markdown and hides frontmatter from reader output', () => {
    const rendered = renderHackmdMarkdown([
      '---',
      'title: Private metadata',
      '---',
      '# Reader',
      '',
      '- [x] task',
      '',
      '| A | B |',
      '| - | - |',
      '| 1 | 2 |',
      '',
      'Footnote[^1].',
      '',
      '[^1]: Detail',
    ].join('\n'));

    expect(rendered.data).toMatchObject({ title: 'Private metadata' });
    expect(rendered.html).toContain('<h1');
    expect(rendered.html).toContain('Reader');
    expect(rendered.html).toContain('task-list-item');
    expect(rendered.html).toContain('<table>');
    expect(rendered.html).toContain('footnote');
    expect(rendered.html).not.toContain('Private metadata');
  });

  it('renders containers, spoilers, callouts, and image figures', () => {
    const rendered = renderHackmdMarkdown([
      ':::warning',
      'Container body',
      ':::',
      '',
      ':::spoiler Details',
      'Hidden body',
      ':::',
      '',
      '> [!tip]',
      '> Callout body',
      '',
      '![Caption](https://example.com/image.png =320x240)',
    ].join('\n'));

    expect(rendered.html).toContain('container-block flash flash-warn');
    expect(rendered.html).toContain('<details>');
    expect(rendered.html).toContain('<summary>Details</summary>');
    expect(rendered.html).toContain('callout callout-success');
    expect(rendered.html).toContain('Callout body');
    expect(rendered.html).toContain('<figure');
    expect(rendered.html).toContain('width="320"');
    expect(rendered.html).toContain('height="240"');
  });

  it('sanitizes scripts, event handlers, and dangerous URLs', () => {
    const rendered = renderHackmdMarkdown('<script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(2)">bad</a>');

    expect(rendered.html).not.toContain('<script');
    expect(rendered.html).not.toContain('onclick');
    expect(rendered.html).not.toContain('javascript:');
    expect(rendered.html).toContain('bad');
  });

  it('renders highlighted code blocks with line numbers and highlighted ranges', () => {
    const rendered = renderHackmdMarkdown([
      '```ts=10 [11-12]',
      'const value: number = 1',
      'console.log(value)',
      '```',
    ].join('\n'));

    expect(rendered.html).toContain('hackdesk-code-block');
    expect(rendered.html).toContain('language-ts');
    expect(rendered.html).toContain('data-line-number="10"');
    expect(rendered.html).toContain('data-line-number="11"');
    expect(rendered.html).toContain('hljs-line highlighted');
  });
});
