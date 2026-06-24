import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor';

const hfmFixtures = [
  {
    name: 'frontmatter and headings',
    markdown: [
      '---',
      'title: Live Preview',
      'tags: [hackmd, editor]',
      '---',
      '',
      '# Heading',
      '## Subheading',
      'Setext heading',
      '---',
    ].join('\n'),
  },
  {
    name: 'inline formatting and links',
    markdown: '**Strong** and *em* and ~~strike~~ and `code` and [Link](https://hackmd.io).',
  },
  {
    name: 'images with HackMD size syntax',
    markdown: '![Alt](https://example.com/image.png =320x180)',
  },
  {
    name: 'task lists',
    markdown: '- [ ] Task\n- [x] Done',
  },
  {
    name: 'fenced code with metadata',
    markdown: ['```ts=10 [12-13]', 'const value = 1;', '```'].join('\n'),
  },
  {
    name: 'callouts and containers',
    markdown: [
      '> [!note]',
      '> HackMD callout stays editable.',
      '',
      ':::warning',
      'Container fallback stays raw.',
      ':::',
      '',
      ':::spoiler Hidden details',
      'secret',
      ':::',
    ].join('\n'),
  },
  {
    name: 'footnotes',
    markdown: 'Footnote reference[^1].\n\n[^1]: footnote text',
  },
  {
    name: 'ruby mark ins sub and sup',
    markdown: '{漢字|かんじ} ==mark== ++inserted++ H~2~O x^2^',
  },
  {
    name: 'abbr and deflist',
    markdown: '*[HTML]: Hyper Text Markup Language\n\nTerm\n: Definition',
  },
  {
    name: 'emoji and table of contents marker',
    markdown: ':smile: :wink:\n\n[TOC]\n\n[[toc]]',
  },
  {
    name: 'raw html and embed fallback',
    markdown: '<iframe src="https://example.com/embed"></iframe>\n\n<div data-test="raw">Raw HTML</div>',
  },
  {
    name: 'tags heading and blockquote metadata',
    markdown: [
      '###### tags: `features` `cool` `updated`',
      '',
      '> [name=ChengHan Wu] [time=Sun, Jun 28, 2015 9:59 PM] [color=#907bf7]',
      '> > Nested blockquote with metadata.',
    ].join('\n'),
  },
  {
    name: 'code fence line number options',
    markdown: [
      '```javascript=101 [102-103]',
      'console.log("numbered");',
      '```',
      '',
      '```javascript=+',
      'console.log("continue");',
      '```',
      '',
      '```!',
      'A very long line should wrap in HackMD.',
      '```',
    ].join('\n'),
  },
  {
    name: 'csvpreview and diagram fences',
    markdown: [
      '```csvpreview {header="true" delimiter="."}',
      'firstName.lastName',
      'Jane.Doe',
      '```',
      '',
      '```mermaid',
      'graph TD',
      'A-->B',
      '```',
      '',
      '```plantuml',
      'start',
      'stop',
      '```',
    ].join('\n'),
  },
  {
    name: 'math blocks and inline math',
    markdown: [
      'The Gamma function is $\\Gamma(n) = (n-1)!$.',
      '',
      '$$',
      'x = {-b \\pm \\sqrt{b^2-4ac} \\over 2a}.',
      '$$',
    ].join('\n'),
  },
  {
    name: 'HackMD externals',
    markdown: [
      '{%youtube 1G4isv_Fylg %}',
      '{%vimeo 124148255 %}',
      '{%gist schacon/4277 %}',
      '{%slideshare briansolis/26-disruptive-technology-trends-2016-2018-56796196 %}',
      '{%speakerdeck sugarenia/xxlcss-how-to-scale-css-and-keep-your-sanity %}',
      '{%pdf https://hackmd.io/pdf-sample.pdf %}',
      '{%figma https://www.figma.com/file/example %}',
    ].join('\n'),
  },
  {
    name: 'tables links and reference images',
    markdown: [
      '| Option | Description |',
      '| ------: | :---------- |',
      '| data | path to files |',
      '',
      '[link with title](http://nodeca.github.io/pica/demo/ "title text!")',
      'Autoconverted link https://github.com/nodeca/pica',
      '',
      '![Alt text][id]',
      '',
      '[id]: https://octodex.github.com/images/dojocat.jpg "The Dojocat"',
    ].join('\n'),
  },
] as const;

describe('MarkdownEditor', () => {
  it('mounts a single CodeMirror editor with raw markdown as the source', async () => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} value="# Hello" onChange={vi.fn()} />);

    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe('# Hello'));
    expect(editor.querySelector('.cm-content')).toHaveTextContent('# Hello');
  });

  it('focuses the CodeMirror content through the imperative handle', async () => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} value="# Hello" onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    act(() => {
      ref.current?.focus();
    });

    await waitFor(() => expect(document.activeElement).toBe(editor.querySelector('.cm-content')));
  });

  it('writes imperative editor changes back to React state without converting markdown', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const onChange = vi.fn();

    render(<MarkdownEditor ref={ref} value="# Hello" onChange={onChange} />);
    await waitFor(() => expect(ref.current).not.toBeNull());

    act(() => {
      ref.current?.insertText('Intro\n');
    });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Intro\n# Hello'));
    expect(ref.current?.getMarkdown()).toBe('Intro\n# Hello');
  });

  it('syncs external value changes into the editor', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const { rerender } = render(<MarkdownEditor ref={ref} value="# First" onChange={vi.fn()} />);

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe('# First'));

    rerender(<MarkdownEditor ref={ref} value="# Second" onChange={vi.fn()} />);

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe('# Second'));
  });

  it('opens CodeMirror search through the imperative handle', async () => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} value="# First" onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    act(() => {
      ref.current?.openSearch();
    });

    await waitFor(() => expect(editor.querySelector('.cm-search')).not.toBeNull());
  });

  it('opens CodeMirror search from the native keyboard shortcut', async () => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} value="# First" onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');
    const content = editor.querySelector('.cm-content');

    expect(content).not.toBeNull();
    act(() => {
      ref.current?.focus();
    });
    fireEvent.keyDown(content as Element, { key: 'f', code: 'KeyF', ctrlKey: true });

    await waitFor(() => expect(editor.querySelector('.cm-search')).not.toBeNull());
  });

  it('hides common markdown syntax on inactive lines while preserving source text', async () => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} value={'# Heading\n\n**Bold**'} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe('# Heading\n\n**Bold**'));
    await waitFor(() => {
      const text = editor.querySelector('.cm-content')?.textContent ?? '';
      expect(text).toContain('# Heading');
      expect(text).toContain('Bold');
      expect(text).not.toContain('**Bold**');
    });
  });

  it('reveals raw markdown syntax on the active line', async () => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} value={'# Heading\n\n**Bold**'} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(editor.querySelector('.cm-content')?.textContent ?? '').toContain('# Heading'));
    await waitFor(() => expect(editor.querySelector('.cm-content')?.textContent ?? '').not.toContain('**Bold**'));
    expect(ref.current?.getMarkdown()).toBe('# Heading\n\n**Bold**');
  });

  it('toggles task checkbox widgets without converting surrounding markdown', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const onChange = vi.fn();

    render(<MarkdownEditor ref={ref} value={'Intro\n- [ ] Task'} onChange={onChange} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    const checkbox = await waitFor(() => {
      const target = editor.querySelector<HTMLInputElement>('input.cm-hackmd-task-checkbox');
      expect(target).not.toBeNull();
      return target as HTMLInputElement;
    });

    fireEvent.click(checkbox);

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe('Intro\n- [x] Task'));
    expect(onChange).toHaveBeenLastCalledWith('Intro\n- [x] Task');
  });

  it('does not crash on multi-line link and image titles', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      '[label](https://example.com "first line',
      'second line")',
      '',
      '![alt](https://example.com/x.png "first',
      'second")',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
  });

  it('shows a reduced image preview without modifying the source line', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = 'Intro\n![Diagram](https://example.com/diagram.png =320x180)';

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(editor.querySelector('.cm-hackmd-image-preview img')).not.toBeNull());
    expect(editor.querySelector('.cm-hackmd-image-preview img')).toHaveAttribute('src', 'https://example.com/diagram.png');
    expect(ref.current?.getMarkdown()).toBe(markdown);
  });

  it('labels recognized HFM blocks that are intentionally not rendered inline', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      '```mermaid',
      'graph TD',
      'A-->B',
      '```',
      '',
      '{%youtube 1G4isv_Fylg %}',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(editor.querySelectorAll('.cm-hackmd-fallback-block')).toHaveLength(2));
    expect(editor.querySelector('.cm-hackmd-fallback-block')).toHaveTextContent('mermaid diagram block');
    expect(ref.current?.getMarkdown()).toBe(markdown);
  });

  it('keeps HackMD code fence options in the editable source instead of showing a fallback panel', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      '```javascript=101 [102-103]',
      'const value = 1;',
      '```',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    expect(editor.querySelector('.cm-hackmd-fallback-block')).toBeNull();
    expect(editor).not.toHaveTextContent('HackMD code fence options');
  });

  it('styles JavaScript fenced code through CodeMirror without a reader renderer', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      '```javascript',
      'const value = "readerless";',
      '```',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    await waitFor(() => expect(editor.querySelector('.cm-hackmd-fenced-code')).not.toBeNull());
    expect(editor.querySelector('.cm-hackmd-fallback-block')).toBeNull();
  });

  it('decorates HFM syntax outside the initial active line', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      ...Array.from({ length: 18 }, (_, index) => `Plain line ${index + 1}`),
      ':::warning',
      'Late warning container',
      ':::',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    await waitFor(() => expect(editor.querySelector('.cm-hackmd-container-warning')).not.toBeNull());
  });

  it.each(hfmFixtures)('keeps HFM fixture editable and byte-preserved: $name', async ({ markdown }) => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
  });
});
