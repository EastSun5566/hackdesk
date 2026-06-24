import { createRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor';

const hfmSample = [
  '---',
  'title: Live Preview',
  'tags: [hackmd, editor]',
  '---',
  '',
  '# Heading',
  '',
  '**Strong** and *em* and ~~strike~~ and `code`.',
  '',
  '> [!note]',
  '> HackMD callout stays editable.',
  '',
  ':::warning',
  'Container fallback stays raw.',
  ':::',
  '',
  '- [ ] Task',
  '- [x] Done',
  '',
  '![Alt](https://example.com/image.png =320x180)',
  '',
  '```ts=10 [12-13]',
  'const value = 1;',
  '```',
  '',
  'Footnote[^1], ==mark==, ++inserted++, H~2~O, x^2^, {ruby|rt}.',
  '',
  '[^1]: footnote text',
].join('\n');

describe('MarkdownEditor', () => {
  it('mounts a single CodeMirror editor with raw markdown as the source', async () => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} value="# Hello" onChange={vi.fn()} />);

    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe('# Hello'));
    expect(editor.querySelector('.cm-content')).toHaveTextContent('# Hello');
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

  it('keeps HackMD-flavored markdown fixtures editable even when live preview cannot render every extension', async () => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} value={hfmSample} onChange={vi.fn()} />);

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(hfmSample));
  });
});
