import { syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';

import { hackmdMarkdownHighlightStyle } from './hackmd-syntax';

export const hackmdPreviewTheme = [
  syntaxHighlighting(hackmdMarkdownHighlightStyle),
  EditorView.theme({
    '&': {
      height: '100%',
      backgroundColor: 'var(--background-default)',
      color: 'var(--text-default)',
      fontSize: '14px',
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-editor)',
      lineHeight: '1.75',
    },
    '.cm-content': {
      padding: '20px 24px',
      caretColor: 'var(--primary-default)',
    },
    '.cm-line': {
      padding: '0 4px',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--background-muted)',
      color: 'var(--text-subtle)',
      borderRight: '1px solid var(--border-default)',
    },
    '.cm-gutterElement': {
      padding: '0 10px 0 8px',
    },
    '.cm-activeLine': {
      backgroundColor: 'color-mix(in oklch, var(--background-selected) 42%, transparent)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--background-selected)',
      color: 'var(--text-default)',
    },
    '.cm-foldGutter .cm-gutterElement': {
      color: 'var(--icon-subtle)',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'var(--primary-soft)',
      outline: '1px solid var(--primary-default)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: 'var(--primary-default)',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'color-mix(in oklch, var(--primary-default) 28%, transparent)',
    },
    '.cm-hackmd-h1': {
      fontSize: '1.55em',
      fontWeight: '750',
      lineHeight: '1.45',
      color: 'var(--text-default)',
    },
    '.cm-hackmd-h2': {
      fontSize: '1.34em',
      fontWeight: '720',
      lineHeight: '1.5',
      color: 'var(--text-default)',
    },
    '.cm-hackmd-h3': {
      fontSize: '1.16em',
      fontWeight: '680',
      color: 'var(--text-default)',
    },
    '.cm-hackmd-h4, .cm-hackmd-h5, .cm-hackmd-h6': {
      fontWeight: '650',
      color: 'var(--text-default)',
    },
    '.cm-hackmd-blockquote': {
      color: 'var(--text-subtle)',
      borderLeft: '3px solid var(--border-strong)',
      paddingLeft: '0.75rem',
    },
    '.cm-hackmd-fenced-code, .cm-hackmd-frontmatter': {
      color: 'var(--text-subtle)',
      backgroundColor: 'var(--background-muted)',
    },
    '.cm-hackmd-hr': {
      color: 'transparent',
      position: 'relative',
    },
    '.cm-hackmd-hr::after': {
      content: '""',
      position: 'absolute',
      left: '0.25rem',
      right: '0.25rem',
      top: '50%',
      borderTop: '1px solid var(--border-default)',
    },
    '.cm-hackmd-callout': {
      backgroundColor: 'var(--primary-soft)',
      color: 'var(--text-default)',
      borderLeft: '3px solid var(--primary-default)',
      paddingLeft: '0.75rem',
    },
    '.cm-hackmd-container': {
      color: 'var(--primary-default)',
      backgroundColor: 'var(--background-muted)',
    },
    '.cm-hackmd-strong': {
      fontWeight: '700',
      color: 'var(--text-default)',
    },
    '.cm-hackmd-em': {
      fontStyle: 'italic',
      color: 'var(--text-default)',
    },
    '.cm-hackmd-strike': {
      textDecoration: 'line-through',
      textDecorationColor: 'var(--text-subtle)',
    },
    '.cm-hackmd-inline-code': {
      borderRadius: '4px',
      backgroundColor: 'var(--primary-soft)',
      color: 'var(--primary-default)',
      padding: '0 0.2em',
    },
    '.cm-hackmd-link': {
      color: 'var(--link-text-default)',
      textDecoration: 'underline',
      textDecorationColor: 'color-mix(in oklch, var(--link-text-default) 45%, transparent)',
      textUnderlineOffset: '0.15em',
    },
    '.cm-hackmd-image': {
      color: 'var(--link-text-default)',
    },
    '.cm-hackmd-list-marker': {
      display: 'inline-block',
      width: '1.25em',
      color: 'var(--text-subtle)',
      textAlign: 'center',
    },
    '.cm-hackmd-task-checkbox': {
      width: '0.95em',
      height: '0.95em',
      margin: '0 0.3em 0 0',
      verticalAlign: '-0.12em',
      accentColor: 'var(--primary-default)',
    },
  }, { dark: true }),
];
