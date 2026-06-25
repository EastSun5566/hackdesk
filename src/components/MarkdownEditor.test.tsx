import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { hfmFixtures } from './hackmd-live-preview/hfm-fixtures';
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor';

describe('MarkdownEditor', () => {
  it('mounts a single CodeMirror editor with raw markdown as the source', async () => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} value="# Hello" onChange={vi.fn()} />);

    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe('# Hello'));
    expect(editor.querySelector('.cm-content')).toHaveTextContent('# Hello');
  });

  it('hides editor gutters so notes read as a writing surface', async () => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} value={'# Hello\n\nBody'} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe('# Hello\n\nBody'));
    expect(editor.querySelector('.cm-gutters')).toBeNull();
    expect(editor.querySelector('.cm-lineNumbers')).toBeNull();
    expect(editor.querySelector('.cm-foldGutter')).toBeNull();
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

    render(<MarkdownEditor ref={ref} value={'# First\nSecond first'} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    act(() => {
      ref.current?.openSearch();
    });

    const searchPanel = await waitFor(() => {
      const target = editor.querySelector<HTMLElement>('.cm-hackdesk-search-panel');
      expect(target).not.toBeNull();
      return target as HTMLElement;
    });

    expect(within(searchPanel).getByRole('textbox', { name: 'Find in note' })).toHaveAttribute('autocomplete', 'off');
    expect(within(searchPanel).getByRole('button', { name: 'Previous match' })).toHaveAttribute('type', 'button');
    expect(within(searchPanel).getByRole('button', { name: 'Next match' })).toHaveAttribute('type', 'button');
    expect(within(searchPanel).getByRole('button', { name: 'Close search' })).toHaveAttribute('type', 'button');
    expect(searchPanel).not.toHaveTextContent(/replace/i);
    expect(searchPanel).not.toHaveTextContent(/match case/i);
    expect(searchPanel).not.toHaveTextContent(/regex/i);
    expect(searchPanel).not.toHaveTextContent(/by word/i);
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

    await waitFor(() => expect(editor.querySelector('.cm-hackdesk-search-panel')).not.toBeNull());
  });

  it('closes the compact search panel with Escape and returns focus to the editor', async () => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} value="# First" onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    act(() => {
      ref.current?.openSearch();
    });

    const searchInput = await waitFor(() => within(editor).getByRole('textbox', { name: 'Find in note' }));

    fireEvent.keyDown(searchInput, { key: 'Escape', code: 'Escape' });

    await waitFor(() => expect(editor.querySelector('.cm-hackdesk-search-panel')).toBeNull());
    expect(document.activeElement).toBe(editor.querySelector('.cm-content'));
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

  it('renders inactive horizontal rules as a rule and reveals raw source on the active line', async () => {
    const inactiveRef = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={inactiveRef} value={'Intro\n\n---\nOutro'} onChange={vi.fn()} />);
    const inactiveEditor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(inactiveEditor.querySelector('.cm-hackmd-hr')).not.toBeNull());
    expect(inactiveEditor.querySelector('.cm-content')).not.toHaveTextContent('---');
    expect(inactiveRef.current?.getMarkdown()).toBe('Intro\n\n---\nOutro');

    const activeRef = createRef<MarkdownEditorHandle>();
    render(<MarkdownEditor ref={activeRef} value={'---\n\nOutro'} onChange={vi.fn()} />);
    const editors = await screen.findAllByTestId('hackmd-markdown-editor');
    const activeEditor = editors.at(-1);

    expect(activeEditor).toBeDefined();
    await waitFor(() => expect(activeEditor?.querySelector('.cm-content')).toHaveTextContent('---'));
    expect(activeEditor?.querySelector('.cm-hackmd-hr')).toBeNull();
    expect(activeRef.current?.getMarkdown()).toBe('---\n\nOutro');
  });

  it('hides inactive container markers and reveals them when the block is active', async () => {
    const inactiveRef = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={inactiveRef} value={'Intro\n\n:::info\n:bulb: Free users can upload images.\n:::'} onChange={vi.fn()} />);
    const inactiveEditor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(inactiveEditor.querySelector('.cm-hackmd-container-block-info')).not.toBeNull());
    expect(inactiveEditor.querySelector('.cm-content')).toHaveTextContent('Free users can upload images.');
    expect(inactiveEditor.querySelector('.cm-content')).not.toHaveTextContent(':::info');
    expect(inactiveRef.current?.getMarkdown()).toBe('Intro\n\n:::info\n:bulb: Free users can upload images.\n:::');

    const activeRef = createRef<MarkdownEditorHandle>();
    render(<MarkdownEditor ref={activeRef} value={':::info\n:bulb: Free users can upload images.\n:::'} onChange={vi.fn()} />);
    const editors = await screen.findAllByTestId('hackmd-markdown-editor');
    const activeEditor = editors.at(-1);

    expect(activeEditor).toBeDefined();
    await waitFor(() => expect(activeEditor?.querySelector('.cm-content')).toHaveTextContent(':::info'));
    expect(activeEditor?.querySelector('.cm-content')).toHaveTextContent(':::');
    expect(activeRef.current?.getMarkdown()).toBe(':::info\n:bulb: Free users can upload images.\n:::');
  });

  it('hides inactive alert markers and reveals them when the block is active', async () => {
    const inactiveRef = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={inactiveRef} value={'Intro\n\n> [!note]\n> A useful note.'} onChange={vi.fn()} />);
    const inactiveEditor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(inactiveEditor.querySelector('.cm-hackmd-alert-block-note')).not.toBeNull());
    expect(inactiveEditor.querySelector('.cm-hackmd-alert-heading-note')).not.toBeNull();
    expect(inactiveEditor.querySelector('.cm-hackmd-alert-heading-note')).toHaveTextContent('Note');
    expect(inactiveEditor.querySelector('.cm-content')).toHaveTextContent('A useful note.');
    expect(inactiveEditor.querySelector('.cm-content')).not.toHaveTextContent('[!note]');
    expect(inactiveRef.current?.getMarkdown()).toBe('Intro\n\n> [!note]\n> A useful note.');

    const activeRef = createRef<MarkdownEditorHandle>();
    render(<MarkdownEditor ref={activeRef} value={'> [!note]\n> A useful note.'} onChange={vi.fn()} />);
    const editors = await screen.findAllByTestId('hackmd-markdown-editor');
    const activeEditor = editors.at(-1);

    expect(activeEditor).toBeDefined();
    await waitFor(() => expect(activeEditor?.querySelector('.cm-content')).toHaveTextContent('[!note]'));
    expect(activeEditor?.querySelector('.cm-content')).toHaveTextContent('A useful note.');
    expect(activeRef.current?.getMarkdown()).toBe('> [!note]\n> A useful note.');
  });

  it('renders GitHub alert variants with stable heading and rail classes', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      'Intro',
      '',
      '> [!note]',
      '> Note body',
      '',
      '> [!tip]',
      '> Tip body',
      '',
      '> [!important]',
      '> Important body',
      '',
      '> [!warning]',
      '> Warning body',
      '',
      '> [!caution]',
      '> Caution body',
      '',
      '> [!danger]',
      '> Danger body',
      '',
      '> [!todo]',
      '> Todo body',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    for (const variant of ['note', 'tip', 'important', 'warning', 'caution', 'danger', 'todo']) {
      expect(editor.querySelector(`.cm-hackmd-alert-block-${variant}`)).not.toBeNull();
      expect(editor.querySelector(`.cm-hackmd-alert-heading-${variant}`)).not.toBeNull();
    }
    expect(editor.querySelector('.cm-hackmd-alert-heading-important')).toHaveTextContent('Important');
    expect(editor.querySelector('.cm-hackmd-alert-heading-danger')).toHaveTextContent('Caution');
    expect(editor.querySelector('.cm-hackmd-alert-heading-todo')).toHaveTextContent('Note');
  });

  it('previews ordered list markers as sequential numbers without changing source', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      '1. First',
      '1. Second',
      '1. Third',
      '',
      '57. Offset',
      '1. Continue offset',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    await waitFor(() => {
      expect([...editor.querySelectorAll('.cm-hackmd-ordered-list-marker')].map((node) => node.textContent)).toEqual([
        '2.',
        '3.',
        '57.',
        '58.',
      ]);
    });
  });

  it('renders tables as editable source-preserving table widgets', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const onChange = vi.fn();
    const markdown = [
      '| Option | Description |',
      '| :----- | ----------: |',
      '| data | path |',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={onChange} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    const table = await waitFor(() => {
      const target = editor.querySelector<HTMLElement>('.cm-hackmd-table');
      expect(target).not.toBeNull();
      return target as HTMLElement;
    });
    expect(table.querySelector('table')).not.toBeNull();
    expect(table.querySelector('caption')).toHaveTextContent('Markdown table');
    expect(table.querySelectorAll('th')).toHaveLength(2);
    expect(table.querySelectorAll('td')).toHaveLength(2);
    expect(table.querySelector('th')).toHaveAttribute('scope', 'col');

    const tableCells = table.querySelectorAll<HTMLElement>('.cm-hackmd-table-cell-source');
    expect(tableCells[0]).toHaveAttribute('role', 'textbox');
    expect(tableCells[0]).toHaveAccessibleName('Table header 1');
    expect(tableCells[3]).toHaveAccessibleName('Table cell 1, 2');
    tableCells[0].focus();
    fireEvent.keyDown(tableCells[0], { key: 'Tab' });
    expect(document.activeElement).toBe(tableCells[1]);
    fireEvent.keyDown(tableCells[1], { key: 'Enter', shiftKey: true });
    expect(document.activeElement).toBe(tableCells[0]);
    expect(onChange).not.toHaveBeenCalled();

    const dataCell = tableCells[3];
    dataCell.textContent = 'file path';
    fireEvent.input(dataCell);

    await waitFor(() => expect(ref.current?.getMarkdown()).toContain('| data | file path |'));
    expect(onChange).toHaveBeenCalledWith([
      '| Option | Description |',
      '| --- | --- |',
      '| data | file path |',
    ].join('\n'));
  });

  it('commits table cell composition only after IME composition ends', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const onChange = vi.fn();
    const markdown = [
      '| Name | Value |',
      '| --- | --- |',
      '| city | Tokyo |',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={onChange} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');
    const valueCell = await waitFor(() => {
      const cells = editor.querySelectorAll<HTMLElement>('.cm-hackmd-table-cell-source');
      expect(cells[3]).toBeDefined();
      return cells[3];
    });

    fireEvent.compositionStart(valueCell);
    valueCell.textContent = '東京';
    fireEvent.input(valueCell, { isComposing: true });

    expect(onChange).not.toHaveBeenCalled();
    expect(ref.current?.getMarkdown()).toBe(markdown);

    fireEvent.compositionEnd(valueCell);

    await waitFor(() => expect(ref.current?.getMarkdown()).toContain('| city | 東京 |'));
    expect(onChange).toHaveBeenLastCalledWith([
      '| Name | Value |',
      '| --- | --- |',
      '| city | 東京 |',
    ].join('\n'));
  });

  it('flattens pasted table cell text and escapes pipes', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const onChange = vi.fn();
    const markdown = [
      '| Name | Value |',
      '| --- | --- |',
      '| field |  |',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={onChange} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');
    const valueCell = await waitFor(() => {
      const cells = editor.querySelectorAll<HTMLElement>('.cm-hackmd-table-cell-source');
      expect(cells[3]).toBeDefined();
      return cells[3];
    });

    valueCell.focus();
    const range = document.createRange();
    range.selectNodeContents(valueCell);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    fireEvent.paste(valueCell, {
      clipboardData: {
        getData: () => 'two\nlines | pipe',
      },
    });

    await waitFor(() => expect(ref.current?.getMarkdown()).toContain('| field | two lines \\| pipe |'));
    expect(onChange).toHaveBeenLastCalledWith([
      '| Name | Value |',
      '| --- | --- |',
      '| field | two lines \\| pipe |',
    ].join('\n'));
  });

  it('does not rewrite markdown when preview affordances are only focused or clicked', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const onChange = vi.fn();
    const markdown = [
      'Intro',
      '',
      '> [!note]',
      '> Alert body',
      '',
      '1. First',
      '1. Second',
      '',
      '| Name | Value |',
      '| --- | --- |',
      '| field | value |',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={onChange} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    const alertHeading = await waitFor(() => {
      const target = editor.querySelector<HTMLElement>('.cm-hackmd-alert-heading-note');
      expect(target).not.toBeNull();
      return target as HTMLElement;
    });
    const listMarker = await waitFor(() => {
      const target = editor.querySelector<HTMLElement>('.cm-hackmd-ordered-list-marker');
      expect(target).not.toBeNull();
      return target as HTMLElement;
    });
    const tableCell = await waitFor(() => {
      const target = editor.querySelector<HTMLElement>('.cm-hackmd-table-cell-source');
      expect(target).not.toBeNull();
      return target as HTMLElement;
    });

    fireEvent.mouseDown(alertHeading);
    fireEvent.mouseDown(listMarker);
    fireEvent.pointerDown(tableCell);
    tableCell.focus();

    expect(onChange).not.toHaveBeenCalled();
    expect(ref.current?.getMarkdown()).toBe(markdown);
  });

  it('hides inactive blockquote metadata and reveals it when active', async () => {
    const inactiveRef = createRef<MarkdownEditorHandle>();
    const markdown = [
      'Intro',
      '',
      '> [name=Michael] [time=Today] [color=#907bf7]',
      '> Quote body.',
    ].join('\n');

    render(<MarkdownEditor ref={inactiveRef} value={markdown} onChange={vi.fn()} />);
    const inactiveEditor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(inactiveEditor.querySelector('.cm-hackmd-blockquote-meta-block-start')).not.toBeNull());
    expect(inactiveEditor.querySelector('.cm-content')).toHaveTextContent('Quote body.');
    expect(inactiveEditor.querySelector('.cm-content')).not.toHaveTextContent('[name=Michael]');
    expect(inactiveRef.current?.getMarkdown()).toBe(markdown);

    const activeRef = createRef<MarkdownEditorHandle>();
    render(<MarkdownEditor ref={activeRef} value={markdown.split('\n').slice(2).join('\n')} onChange={vi.fn()} />);
    const editors = await screen.findAllByTestId('hackmd-markdown-editor');
    const activeEditor = editors.at(-1);

    expect(activeEditor).toBeDefined();
    await waitFor(() => expect(activeEditor?.querySelector('.cm-content')).toHaveTextContent('[name=Michael]'));
    expect(activeRef.current?.getMarkdown()).toBe(markdown.split('\n').slice(2).join('\n'));
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

  it('focuses the image source line when the image preview is clicked', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = 'Intro\n![Diagram](https://example.com/diagram.png =320x180)';

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    const preview = await waitFor(() => {
      const target = editor.querySelector<HTMLElement>('.cm-hackmd-image-preview');
      expect(target).not.toBeNull();
      return target as HTMLElement;
    });

    fireEvent.mouseDown(preview);

    await waitFor(() => {
      const activeLine = editor.querySelector('.cm-activeLine');
      expect(activeLine).toHaveTextContent('![Diagram](https://example.com/diagram.png =320x180)');
    });
  });

  it('keeps recognized HFM blocks as low-noise styled source without fallback labels', async () => {
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

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    await waitFor(() => expect(editor.querySelector('.cm-hackmd-fenced-code')).not.toBeNull());
    expect(editor.querySelector('.cm-hackmd-external-youtube')).not.toBeNull();
    expect(editor.querySelector('.cm-hackmd-fallback-block')).toBeNull();
    expect(editor).not.toHaveTextContent('Mermaid diagram block');
    expect(editor).not.toHaveTextContent('YouTube embed');
  });

  it('keeps HackMD-looking text inside fenced code as raw code source', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      'Intro',
      '',
      '```markdown',
      '> ya',
      '',
      ':::info',
      'yo',
      ':::',
      '| A | B |',
      '| --- | --- |',
      '$$',
      '```',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    await waitFor(() => expect(editor.querySelector('.cm-hackmd-fenced-code')).not.toBeNull());
    expect(editor.querySelector('.cm-hackmd-alert-block')).toBeNull();
    expect(editor.querySelector('.cm-hackmd-container-block')).toBeNull();
    expect(editor.querySelector('.cm-hackmd-blockquote')).toBeNull();
    expect(editor.querySelector('.cm-hackmd-table')).toBeNull();
    expect(editor.querySelector('.cm-hackmd-math-block-line')).toBeNull();
    expect(editor).toHaveTextContent('> ya');
    expect(editor).toHaveTextContent(':::info');
    expect(editor).toHaveTextContent(':::');
    expect(editor).toHaveTextContent('| A | B |');
    expect(editor).toHaveTextContent('$$');
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

  it('keeps unsupported code fences editable without fallback widgets', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      '```python',
      'print("still editable")',
      '```',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    await waitFor(() => expect(editor.querySelector('.cm-hackmd-fenced-code')).not.toBeNull());
    expect(editor.querySelector('.cm-hackmd-fallback-block')).toBeNull();
  });

  it('decorates alert, container, math, and external source lines without previewing fenced code content', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      '> [!note]',
      '> alert',
      ':::warning',
      'container',
      ':::',
      '$$',
      'x = 1',
      '$$',
      '{%youtube 1G4isv_Fylg %}',
      '```mermaid',
      'graph TD',
      'A-->B',
      '```',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    await waitFor(() => expect(editor.querySelector('.cm-hackmd-alert-note')).not.toBeNull());
    expect(editor.querySelector('.cm-hackmd-container-warning')).not.toBeNull();
    expect(editor.querySelector('.cm-hackmd-math-block-line')).not.toBeNull();
    expect(editor.querySelector('.cm-hackmd-external-youtube')).not.toBeNull();
    expect(editor.querySelector('.cm-hackmd-fenced-code')).not.toBeNull();
    expect(editor.querySelector('.cm-hackmd-hfm-fence-mermaid')).toBeNull();
  });

  it('decorates inline math, reference links, reference definitions, and raw HTML safely', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      'Inline math $x + y$ and reference [Guide][docs] plus image ![Logo][logo].',
      '',
      '[docs]: https://hackmd.io/features "Features"',
      '[logo]: https://example.com/logo.png "Logo"',
      '',
      '<i class="fa fa-pencil"></i> <iframe src="https://example.com"></iframe>',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    await waitFor(() => expect(editor.querySelector('.cm-hackmd-inline-math')).not.toBeNull());
    expect(editor.querySelector('.cm-hackmd-reference-link')).not.toBeNull();
    expect(editor.querySelector('.cm-hackmd-reference-def')).not.toBeNull();
    expect(editor.querySelector('.cm-hackmd-raw-html')).not.toBeNull();
  });

  it('decorates P2 safe coverage syntax without changing source bytes', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      ':::spoiler {state="open"} Expand the spoiler container by default',
      'You found me :stuck_out_tongue_winking_eye:',
      ':::',
      '',
      '```csvpreview {header="true" delimiter="."}',
      'firstName.lastName',
      'Jane.Doe',
      '```',
      '',
      'Inline footnote^[Text of inline footnote] and https://hackmd.io/features',
      '(c) (tm) +- test... Remarkable -- awesome "Smartypants"',
      '',
      '    // Some comments',
      '    line 1 of code',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    await waitFor(() => expect(editor.querySelector('.cm-hackmd-container-meta')).not.toBeNull());
    expect(editor.querySelector('.cm-hackmd-inline-footnote')).not.toBeNull();
    expect(editor.querySelector('.cm-hackmd-typographer')).not.toBeNull();
    expect(editor.querySelector('.cm-hackmd-indented-code')).not.toBeNull();
    expect(editor.querySelector('.cm-hackmd-fenced-code')).not.toBeNull();
    expect(editor.querySelector('.cm-hackmd-hfm-fence-csvpreview')).toBeNull();
    expect(editor).not.toHaveTextContent('CSV preview block');
  });

  it('decorates active autolinks as source-safe links', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = 'Autoconverted link https://hackmd.io/features';

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    await waitFor(() => expect(editor.querySelector('.cm-hackmd-autolink')).not.toBeNull());
  });

  it('keeps CSV fence options as raw fenced code source', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      '```csvpreview {header="true" delimiter="."}',
      'firstName.lastName',
      'Jane.Doe',
      '```',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    await waitFor(() => expect(editor.querySelector('.cm-hackmd-fenced-code')).not.toBeNull());
    expect(editor.querySelector('.cm-hackmd-fence-meta')).toBeNull();
    expect(editor).toHaveTextContent('{header="true" delimiter="."}');
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
