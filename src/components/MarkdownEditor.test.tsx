import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { hfmFixtures } from './hackmd-live-preview/hfm-fixtures';
import { formatMarkdownImage } from './hackmd-live-preview/markdown-image';
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor';

describe('MarkdownEditor', () => {
  it('formats markdown image insertion with escaped alt text', () => {
    expect(formatMarkdownImage('selected].png', 'attachments/selected.png')).toBe('![selected\\].png](attachments/selected.png)');
    expect(formatMarkdownImage('', 'attachments/image.png')).toBe('![image](attachments/image.png)');
  });

  it('mounts a single CodeMirror editor with raw markdown as the source', async () => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} value="# Hello" onChange={vi.fn()} />);

    const editor = await screen.findByTestId('hackmd-markdown-editor', {}, { timeout: 5_000 });

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

  it('inserts pasted image attachments through the editor attachment handler', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const onAttachImage = vi.fn(async () => ({ link: 'https://assets.example/pasted.png' }));
    const onChange = vi.fn();

    render(
      <MarkdownEditor
        ref={ref}
        value=""
        onAttachImage={onAttachImage}
        onChange={onChange}
      />,
    );
    const editor = await screen.findByTestId('hackmd-markdown-editor');
    const content = editor.querySelector('.cm-content');
    const file = new File(['image-bytes'], 'pasted.png', { type: 'image/png' });

    expect(content).not.toBeNull();
    fireEvent.paste(content as Element, {
      clipboardData: {
        files: [file],
        getData: () => '',
      },
    });

    await waitFor(() => expect(onAttachImage).toHaveBeenCalledWith(file));
    await waitFor(() => expect(ref.current?.getMarkdown()).toBe('![pasted.png](https://assets.example/pasted.png)'));
    expect(onChange).toHaveBeenLastCalledWith('![pasted.png](https://assets.example/pasted.png)');
  });

  it('does not attach non-image pasted files', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const onAttachImage = vi.fn(async () => ({ link: 'https://assets.example/file.txt' }));

    render(
      <MarkdownEditor
        ref={ref}
        value=""
        onAttachImage={onAttachImage}
        onChange={vi.fn()}
      />,
    );
    const editor = await screen.findByTestId('hackmd-markdown-editor');
    const content = editor.querySelector('.cm-content');
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    expect(content).not.toBeNull();
    fireEvent.paste(content as Element, {
      clipboardData: {
        files: [file],
        getData: () => '',
      },
    });

    expect(onAttachImage).not.toHaveBeenCalled();
    expect(ref.current?.getMarkdown()).toBe('');
  });

  it('shows a subtle affordance only while image files are dragged over the editor', async () => {
    render(<MarkdownEditor value="" onAttachImage={vi.fn()} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    fireEvent.dragEnter(editor, {
      dataTransfer: {
        items: [{ kind: 'file', type: 'text/plain' }],
      },
    });
    expect(screen.queryByTestId('markdown-editor-image-drop-affordance')).not.toBeInTheDocument();

    fireEvent.dragEnter(editor, {
      dataTransfer: {
        items: [{ kind: 'file', type: 'image/png' }],
      },
    });
    expect(screen.getByTestId('markdown-editor-image-drop-affordance')).toHaveTextContent('Drop image to attach');

    fireEvent.drop(editor, {
      dataTransfer: {
        items: [{ kind: 'file', type: 'image/png' }],
      },
    });
    expect(screen.queryByTestId('markdown-editor-image-drop-affordance')).not.toBeInTheDocument();
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

  it('runs Vim mode with a visible status panel', async () => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} editorMode="vim" value="# Hello" onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');
    const content = editor.querySelector('.cm-content');

    expect(content).not.toBeNull();
    await waitFor(() => expect(editor.querySelector('.cm-vim-panel')).toHaveTextContent('NORMAL'));
    expect(editor.querySelector('.cm-editor')).toHaveAttribute('data-editor-mode', 'vim');
    expect(editor.querySelector('.cm-editor')).not.toHaveAttribute('data-editor-mode-loading');

    act(() => ref.current?.focus());
    fireEvent.keyDown(content as Element, { key: 'i', code: 'KeyI' });
    await waitFor(() => expect(editor.querySelector('.cm-vim-panel')).toHaveTextContent('INSERT'));

    fireEvent.keyDown(content as Element, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(editor.querySelector('.cm-vim-panel')).toHaveTextContent('NORMAL'));
  });

  it('runs Helix mode with visible mode and command panels', async () => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} editorMode="helix" value="# Hello" onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');
    const content = editor.querySelector('.cm-content');

    expect(content).not.toBeNull();
    await waitFor(() => expect(editor.querySelector('.cm-hx-status-panel')).toHaveTextContent('NOR'));
    const commandPanel = editor.querySelector('.cm-hx-command-panel');
    expect(commandPanel).not.toBeNull();
    expect(commandPanel).not.toBeVisible();
    expect(getComputedStyle(editor.querySelector('.cm-hx-status-panel') as Element).minHeight).toBe('22px');
    expect(editor.querySelector('.cm-editor')).toHaveAttribute('data-editor-mode', 'helix');
    expect(editor.querySelector('.cm-editor')).not.toHaveAttribute('data-editor-mode-loading');

    act(() => ref.current?.focus());
    fireEvent.keyDown(content as Element, { key: 'i', code: 'KeyI' });
    await waitFor(() => expect(editor.querySelector('.cm-hx-status-panel')).toHaveTextContent('INS'));

    fireEvent.keyDown(content as Element, { key: 'Escape', code: 'Escape' });
    await waitFor(() => expect(editor.querySelector('.cm-hx-status-panel')).toHaveTextContent('NOR'));

    fireEvent.keyDown(content as Element, { key: ':', code: 'Semicolon', shiftKey: true });
    await waitFor(() => expect(editor.querySelector('.cm-hx-command-input')).not.toBeNull());
    expect(commandPanel).toBeVisible();
  });

  it('switches editor modes without remounting CodeMirror or duplicating panels', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const { rerender } = render(
      <MarkdownEditor ref={ref} editorMode="standard" value="# Hello" onChange={vi.fn()} />,
    );
    const editor = await screen.findByTestId('hackmd-markdown-editor');
    const codeMirror = editor.querySelector('.cm-editor');
    const content = editor.querySelector('.cm-content');

    expect(codeMirror).not.toBeNull();
    expect(content).not.toBeNull();
    expect(editor.querySelector('.cm-vim-panel')).toBeNull();
    expect(editor.querySelector('.cm-hx-status-panel')).toBeNull();
    act(() => ref.current?.focus());
    expect(document.activeElement).toBe(content);

    rerender(<MarkdownEditor ref={ref} editorMode="vim" value="# Hello" onChange={vi.fn()} />);
    await waitFor(() => expect(editor.querySelectorAll('.cm-vim-panel')).toHaveLength(1));
    expect(editor.querySelector('.cm-editor')).toBe(codeMirror);
    expect(ref.current?.getMarkdown()).toBe('# Hello');
    expect(document.activeElement).toBe(content);

    rerender(<MarkdownEditor ref={ref} editorMode="helix" value="# Hello" onChange={vi.fn()} />);
    await waitFor(() => expect(editor.querySelector('.cm-vim-panel')).toBeNull());
    expect(editor.querySelectorAll('.cm-hx-status-panel')).toHaveLength(1);
    expect(editor.querySelectorAll('.cm-hx-command-panel')).toHaveLength(1);
    expect(editor.querySelector('.cm-editor')).toBe(codeMirror);
    expect(ref.current?.getMarkdown()).toBe('# Hello');
    expect(document.activeElement).toBe(content);

    rerender(<MarkdownEditor ref={ref} editorMode="standard" value="# Hello" onChange={vi.fn()} />);
    await waitFor(() => expect(editor.querySelector('.cm-hx-status-panel')).toBeNull());
    expect(editor.querySelector('.cm-hx-command-panel')).toBeNull();
    expect(editor.querySelector('.cm-editor')).toBe(codeMirror);
    expect(document.activeElement).toBe(content);
  });

  it('does not apply stale modal engines after a quick switch back to standard', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const { rerender } = render(
      <MarkdownEditor ref={ref} editorMode="standard" value="# Hello" onChange={vi.fn()} />,
    );
    const editor = await screen.findByTestId('hackmd-markdown-editor');
    const codeMirror = editor.querySelector('.cm-editor');

    expect(codeMirror).not.toBeNull();
    expect(editor.querySelector('.cm-vim-panel')).toBeNull();

    rerender(<MarkdownEditor ref={ref} editorMode="vim" value="# Hello" onChange={vi.fn()} />);
    expect(codeMirror).toHaveAttribute('data-editor-mode', 'vim');

    rerender(<MarkdownEditor ref={ref} editorMode="standard" value="# Hello" onChange={vi.fn()} />);

    await waitFor(() => {
      expect(codeMirror).toHaveAttribute('data-editor-mode', 'standard');
      expect(codeMirror).not.toHaveAttribute('data-editor-mode-loading');
      expect(editor.querySelector('.cm-vim-panel')).toBeNull();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(editor.querySelector('.cm-vim-panel')).toBeNull();
  });

  it.each(['vim', 'helix'] as const)('keeps HackDesk search on Ctrl+F in %s mode', async (editorMode) => {
    const ref = createRef<MarkdownEditorHandle>();

    render(<MarkdownEditor ref={ref} editorMode={editorMode} value="# First" onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');
    const content = editor.querySelector('.cm-content');

    expect(content).not.toBeNull();
    if (editorMode === 'vim') {
      await waitFor(() => expect(editor.querySelector('.cm-vim-panel')).toHaveTextContent('NORMAL'));
    } else {
      await waitFor(() => expect(editor.querySelector('.cm-hx-status-panel')).toHaveTextContent('NOR'));
    }
    act(() => ref.current?.focus());
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
      'Intro',
      '',
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
      'Intro',
      '',
      '| Option | Description |',
      '| --- | --- |',
      '| data | file path |',
    ].join('\n'));
  });

  it('commits table cell composition only after IME composition ends', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const onChange = vi.fn();
    const markdown = [
      'Intro',
      '',
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
      'Intro',
      '',
      '| Name | Value |',
      '| --- | --- |',
      '| city | 東京 |',
    ].join('\n'));
  });

  it('flattens pasted table cell text and escapes pipes', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const onChange = vi.fn();
    const markdown = [
      'Intro',
      '',
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
      'Intro',
      '',
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
      '',
      '<i class="fa fa-pencil"></i>',
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
    const fontAwesomeIcon = await waitFor(() => {
      const target = editor.querySelector<HTMLElement>('.cm-hackmd-rich-icon');
      expect(target?.querySelector('i')).not.toBeNull();
      return target as HTMLElement;
    });

    fireEvent.mouseDown(alertHeading);
    fireEvent.mouseDown(listMarker);
    fireEvent.pointerDown(tableCell);
    fireEvent.mouseDown(fontAwesomeIcon);
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
    expect(editor.querySelector('.cm-hackmd-image-preview img')).toHaveAttribute('width', '320');
    expect(editor.querySelector('.cm-hackmd-image-preview img')).toHaveAttribute('height', '180');
    expect(ref.current?.getMarkdown()).toBe(markdown);
  });

  it('caches loaded image dimensions so remounted previews reserve stable height', async () => {
    const markdown = 'Intro\n![Diagram](https://example.com/cached-dimensions.png)';
    const firstRef = createRef<MarkdownEditorHandle>();
    const firstRender = render(<MarkdownEditor ref={firstRef} value={markdown} onChange={vi.fn()} />);
    const firstEditor = await screen.findByTestId('hackmd-markdown-editor');

    const firstImage = await waitFor(() => {
      const target = firstEditor.querySelector<HTMLImageElement>('.cm-hackmd-image-preview img');
      expect(target).not.toBeNull();
      return target as HTMLImageElement;
    });
    Object.defineProperty(firstImage, 'naturalWidth', { configurable: true, value: 640 });
    Object.defineProperty(firstImage, 'naturalHeight', { configurable: true, value: 360 });
    fireEvent.load(firstImage);
    firstRender.unmount();

    const secondRef = createRef<MarkdownEditorHandle>();
    render(<MarkdownEditor ref={secondRef} value={markdown} onChange={vi.fn()} />);
    const secondEditor = await screen.findByTestId('hackmd-markdown-editor');

    const secondImage = await waitFor(() => {
      const target = secondEditor.querySelector<HTMLImageElement>('.cm-hackmd-image-preview img');
      expect(target).not.toBeNull();
      return target as HTMLImageElement;
    });
    expect(secondImage).toHaveAttribute('width', '640');
    expect(secondImage).toHaveAttribute('height', '360');
    expect(secondRef.current?.getMarkdown()).toBe(markdown);
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

  it('renders emoji shortcodes and safe Font Awesome icon tags on inactive lines', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      'Intro',
      '',
      'Ship it :rocket: <i class="fa fa-pencil fa-fw"></i>',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    await waitFor(() => expect(editor.querySelector('.cm-hackmd-rich-emoji')).toHaveTextContent('🚀'));
    await waitFor(() => expect(editor.querySelector('.cm-hackmd-rich-icon i')).toHaveClass('fa-pencil'));
    expect(editor.querySelector('.cm-content')).not.toHaveTextContent(':rocket:');
    expect(editor.querySelector('.cm-content')).not.toHaveTextContent('<i class="fa fa-pencil fa-fw"></i>');
  });

  it('does not render unsafe raw HTML as a Font Awesome widget', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      'Intro',
      '',
      '<i onclick="alert(1)" class="fa fa-pencil"></i>',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    expect(editor.querySelector('.cm-hackmd-rich-icon')).toBeNull();
    expect(editor.querySelector('.cm-content')).toHaveTextContent('onclick');
  });

  it('renders csvpreview fences as read-only table previews without changing source', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      'Intro',
      '',
      '```csvpreview header="true" delimiter=";"',
      'Name;Value',
      'alpha;"two;parts"',
      '```',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    const table = await waitFor(() => {
      const target = editor.querySelector<HTMLElement>('.cm-hackmd-csv-preview');
      expect(target).not.toBeNull();
      return target as HTMLElement;
    });
    expect(table.querySelectorAll('th')).toHaveLength(2);
    expect(table.querySelectorAll('td')).toHaveLength(2);
    expect(table).toHaveTextContent('Name');
    expect(table).toHaveTextContent('two;parts');
    expect(table.querySelector('[contenteditable="true"]')).toBeNull();
    expect(ref.current?.getMarkdown()).toBe(markdown);
  });

  it('renders inline and block KaTeX previews without changing markdown', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      'Intro',
      '',
      'Inline math $x^2 + y^2 = z^2$ works.',
      '',
      '$$',
      '\\frac{1}{x}',
      '$$',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => {
      expect(editor.querySelector('.cm-hackmd-rich-math-inline .katex, .cm-hackmd-rich-math-inline .cm-hackmd-math-fallback')).not.toBeNull();
    }, { timeout: 8000 });
    await waitFor(() => {
      expect(editor.querySelector('.cm-hackmd-math-preview .katex, .cm-hackmd-math-preview .cm-hackmd-math-fallback')).not.toBeNull();
    }, { timeout: 8000 });
    expect(editor.querySelector('.cm-content')).not.toHaveTextContent('$x^2 + y^2 = z^2$');
    expect(ref.current?.getMarkdown()).toBe(markdown);
  }, 15000);

  it.each([
    { name: 'bare', opener: '```' },
    { name: 'typed', opener: '```ts' },
  ])('does not render math previews inside $name code fences', async ({ opener }) => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      'Intro',
      '',
      opener,
      '$$',
      '\\frac{1}{x}',
      '$$',
      'Inline $x^2$ should stay raw here.',
      '```',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    expect(editor.querySelector('.cm-hackmd-math-preview')).toBeNull();
    expect(editor.querySelector('.cm-hackmd-rich-math-inline')).toBeNull();
    expect(editor).toHaveTextContent('Inline $x^2$ should stay raw here.');
  });

  it('reveals raw math source on the active line', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      'Inline math $x^2$ should be raw while active.',
      '',
      '$$',
      '\\frac{1}{x}',
      '$$',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    await waitFor(() => expect(ref.current?.getMarkdown()).toBe(markdown));
    expect(editor.querySelector('.cm-hackmd-rich-math-inline')).toBeNull();
    expect(editor).toHaveTextContent('Inline math $x^2$ should be raw while active.');
  });

  it('renders Mermaid fences as sanitized diagram previews without changing source', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      'Intro',
      '',
      '```mermaid',
      'graph TD',
      'A[Start] --> B[Done]',
      '```',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');

    const diagram = await waitFor(() => {
      const target = editor.querySelector<HTMLElement>('.cm-hackmd-mermaid-preview');
      expect(target).not.toBeNull();
      expect(target?.querySelector('svg')).not.toBeNull();
      return target as HTMLElement;
    }, { timeout: 8000 });
    expect(diagram.innerHTML).not.toMatch(/<script|onload=/i);
    expect(ref.current?.getMarkdown()).toBe(markdown);
  });

  it('reveals rich preview source when keyboard navigation enters the block', async () => {
    const ref = createRef<MarkdownEditorHandle>();
    const markdown = [
      'Before',
      '```mermaid',
      'graph TD',
      'A-->B',
      '```',
      'After',
    ].join('\n');

    render(<MarkdownEditor ref={ref} value={markdown} onChange={vi.fn()} />);
    const editor = await screen.findByTestId('hackmd-markdown-editor');
    const content = editor.querySelector<HTMLElement>('.cm-content');

    await waitFor(() => expect(editor.querySelector('.cm-hackmd-mermaid-preview')).not.toBeNull());
    act(() => {
      ref.current?.focus();
    });
    fireEvent.keyDown(content ?? editor, { key: 'ArrowDown' });

    await waitFor(() => expect(editor.querySelector('.cm-hackmd-mermaid-preview')).toBeNull());
    expect(editor.querySelector('.cm-content')).toHaveTextContent('```mermaid');
    expect(editor.querySelector('.cm-content')).toHaveTextContent('A-->B');
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
