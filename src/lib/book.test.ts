import { describe, expect, it } from 'vitest';

import { parseBook, type BookNode } from './book';

/** The tree as indented `kind title` lines, which is easier to read than nested objects. */
function outline(nodes: BookNode[], depth = 0): string[] {
  return nodes.flatMap((node) => {
    const pad = '  '.repeat(depth);
    if (node.kind === 'divider') return [`${pad}---`];
    const label = node.kind === 'chapter' ? `${node.title} -> ${node.target}` : `# ${node.title}`;
    return [`${pad}${label}`, ...outline(node.children, depth + 1)];
  });
}

describe('parseBook', () => {
  it('reads sections from headings and chapters from bulleted links', () => {
    const book = parseBook([
      'Handbook',
      '===',
      '',
      'Welcome to the team.',
      '',
      '## Getting started',
      '- [Setup](https://hackmd.io/@team/setup)',
      '  - [Accounts](/@team/accounts)',
      '- [Tools](https://hackmd.io/abc123)',
      '',
      '### Deep dive',
      '* [Architecture](./architecture.md)',
      '',
      '## Reference',
      '+ [HackMD docs](https://hackmd.io/c/tutorials) [target=_blank]',
    ].join('\n'));

    expect(outline(book.nodes)).toEqual([
      '# Handbook',
      '  # Getting started',
      '    Setup -> https://hackmd.io/@team/setup',
      '      Accounts -> /@team/accounts',
      '    Tools -> https://hackmd.io/abc123',
      '    # Deep dive',
      '      Architecture -> ./architecture.md',
      '  # Reference',
      '    HackMD docs -> https://hackmd.io/c/tutorials',
    ]);
    expect(book.chapters.map(chapter => [chapter.index, chapter.title])).toEqual([
      [0, 'Setup'], [1, 'Accounts'], [2, 'Tools'], [3, 'Architecture'], [4, 'HackMD docs'],
    ]);
    expect(book.chapters.map(chapter => chapter.newTab)).toEqual([false, false, false, false, true]);
  });

  it('groups chapters under link-less bullets, dropping groups with nothing to open', () => {
    const book = parseBook([
      '- Part one',
      '  - [Intro](./intro.md)',
      '- Empty part',
      '  - just a note',
      '- [Outro](./outro.md)',
    ].join('\n'));
    expect(outline(book.nodes)).toEqual([
      '# Part one',
      '  Intro -> ./intro.md',
      'Outro -> ./outro.md',
    ]);
  });

  it('keeps sections three deep and chapters four deep', () => {
    const book = parseBook([
      '# One',
      '## Two',
      '### Three',
      '#### Four is still level three',
      '- [A](./a.md)',
      '  - [B](./b.md)',
      '    - [Too deep](./c.md)',
    ].join('\n'));
    expect(outline(book.nodes)).toEqual([
      '# One',
      '  # Two',
      '    # Three',
      '    # Four is still level three',
      '      A -> ./a.md',
    ]);
    expect(book.chapters).toHaveLength(1);
  });

  it('skips front matter, code, and numbered lists, and keeps dividers', () => {
    const book = parseBook([
      '---',
      'title: Handbook',
      '---',
      '- [First](./first.md)',
      '',
      '---',
      '',
      '```md',
      '- [In code](./code.md)',
      '```',
      '1. [Numbered](./numbered.md)',
      '   - [Nested in numbered](./nested.md)',
      '- [Escaped \\] title](./second.md)',
      '- [](https://example.com/untitled)',
    ].join('\n'));
    expect(outline(book.nodes)).toEqual([
      'First -> ./first.md',
      '---',
      'Escaped ] title -> ./second.md',
      'https://example.com/untitled -> https://example.com/untitled',
    ]);
  });
});
