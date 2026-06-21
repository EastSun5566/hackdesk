import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MarkdownEditor } from './MarkdownEditor';

vi.mock('@codemirror/autocomplete', () => ({
  closeBrackets: () => ({}),
  closeBracketsKeymap: [],
}));

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [],
  history: () => ({}),
  historyKeymap: [],
  indentWithTab: {},
}));

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: () => ({}),
}));

vi.mock('@codemirror/language', () => ({
  bracketMatching: () => ({}),
  defaultHighlightStyle: {},
  foldGutter: () => ({}),
  foldKeymap: [],
  HighlightStyle: {
    define: () => ({}),
  },
  indentOnInput: () => ({}),
  syntaxHighlighting: () => ({}),
}));

vi.mock('@codemirror/search', () => ({
  highlightSelectionMatches: () => ({}),
  searchKeymap: [],
}));

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: ({ doc, extensions }: { doc: string; extensions: unknown[] }) => ({
      doc: {
        length: doc.length,
        toString: () => doc,
      },
      extensions,
    }),
  },
}));

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    static updateListener = {
      of: (listener: (update: { docChanged: boolean; state: { doc: { toString: () => string } } }) => void) => ({
        type: 'updateListener',
        listener,
      }),
    };

    static theme = () => ({});

    state: { doc: { length: number; toString: () => string }; extensions: unknown[] };
    private readonly listeners: Array<(update: { docChanged: boolean; state: MockEditorView['state'] }) => void>;
    private readonly textarea: HTMLTextAreaElement;

    constructor({
      parent,
      state,
    }: {
      parent: HTMLElement;
      state: MockEditorView['state'];
    }) {
      this.state = state;
      this.listeners = state.extensions
        .filter((extension): extension is { type: 'updateListener'; listener: MockEditorView['listeners'][number] } => (
          typeof extension === 'object'
          && extension !== null
          && 'type' in extension
          && extension.type === 'updateListener'
          && 'listener' in extension
          && typeof extension.listener === 'function'
        ))
        .map((extension) => extension.listener);
      this.textarea = document.createElement('textarea');
      this.textarea.ariaLabel = 'markdown-editor';
      this.textarea.value = this.state.doc.toString();
      this.textarea.addEventListener('input', () => {
        this.applyValue(this.textarea.value, true);
      });
      parent.appendChild(this.textarea);
    }

    dispatch({ changes }: { changes: { insert: string } }) {
      this.applyValue(changes.insert, false);
    }

    destroy() {
      this.textarea.remove();
    }

    private applyValue(value: string, notify: boolean) {
      this.state = {
        ...this.state,
        doc: {
          length: value.length,
          toString: () => value,
        },
      };
      this.textarea.value = value;

      if (notify) {
        this.listeners.forEach((listener) => listener({ docChanged: true, state: this.state }));
      }
    }
  }

  return {
    crosshairCursor: () => ({}),
    drawSelection: () => ({}),
    dropCursor: () => ({}),
    EditorView: MockEditorView,
    highlightActiveLine: () => ({}),
    highlightActiveLineGutter: () => ({}),
    keymap: { of: () => ({}) },
    lineNumbers: () => ({}),
    rectangularSelection: () => ({}),
  };
});

vi.mock('@lezer/highlight', () => {
  const tag = {};

  return {
    tags: {
      atom: tag,
      bool: tag,
      comment: tag,
      contentSeparator: tag,
      definition: () => tag,
      emphasis: tag,
      heading: tag,
      heading1: tag,
      heading2: tag,
      heading3: tag,
      invalid: tag,
      keyword: tag,
      link: tag,
      list: tag,
      meta: tag,
      monospace: tag,
      number: tag,
      propertyName: tag,
      quote: tag,
      string: tag,
      strikethrough: tag,
      strong: tag,
      url: tag,
      variableName: tag,
    },
  };
});

describe('MarkdownEditor', () => {
  it('writes editor changes back to React state', async () => {
    const onChange = vi.fn();

    render(<MarkdownEditor value="# Hello" onChange={onChange} />);

    const editor = await screen.findByLabelText('markdown-editor');
    expect(editor).toHaveValue('# Hello');

    fireEvent.input(editor, { target: { value: '# Updated' } });

    expect(onChange).toHaveBeenCalledWith('# Updated');
  });

  it('syncs external value changes into the editor', async () => {
    const { rerender } = render(<MarkdownEditor value="# First" onChange={vi.fn()} />);

    const editor = await screen.findByLabelText('markdown-editor');
    expect(editor).toHaveValue('# First');

    rerender(<MarkdownEditor value="# Second" onChange={vi.fn()} />);

    expect(editor).toHaveValue('# Second');
  });
});
