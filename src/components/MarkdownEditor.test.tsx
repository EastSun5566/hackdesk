import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor';
import { renderHackmdMarkdown } from '@/lib/electron-markdown-renderer';

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
    markdown: ':smile:\n\n[[toc]]',
  },
  {
    name: 'raw html and embed fallback',
    markdown: '<iframe src="https://example.com/embed"></iframe>\n\n<div data-test="raw">Raw HTML</div>',
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

  it.each(hfmFixtures)('keeps HFM fixture editable and byte-preserved: $name', async ({ markdown }) => {
    const ref = createRef<MarkdownEditorHandle>();

    expect(() => renderHackmdMarkdown(markdown)).not.toThrow();
    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
  });
});
