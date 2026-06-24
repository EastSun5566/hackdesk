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
      '--code-keyword': '#c792ea',
      '--code-string': '#c3e88d',
      '--code-number': '#f78c6c',
      '--code-comment': '#6a7a82',
      '--code-type': '#ffcb6b',
      '--code-function': '#82aaff',
      '--code-property': '#82aaff',
      '--code-regexp': '#f07178',
      '--code-escape': '#89ddff',
      '--code-operator': '#89ddff',
      '--code-variable': '#eeffff',
      '--code-invalid': '#ff5370',
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
    '.cm-activeLine.cm-hackmd-fenced-code': {
      backgroundColor: 'color-mix(in oklch, var(--background-muted) 92%, var(--primary-default) 8%)',
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
    '.cm-hackmd-fenced-code': {
      fontFamily: 'var(--font-editor)',
      backgroundColor: 'color-mix(in oklch, var(--background-muted) 92%, black 8%)',
      boxShadow: 'inset 2px 0 0 color-mix(in oklch, var(--primary-default) 50%, var(--border-strong) 50%)',
      paddingLeft: '0.75rem',
      paddingRight: '0.75rem',
    },
    '.cm-hackmd-frontmatter': {
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
      color: 'var(--text-default)',
      borderLeft: '3px solid var(--primary-default)',
      paddingLeft: '0.75rem',
    },
    '.cm-hackmd-container': {
      color: 'var(--text-default)',
      borderLeft: '3px solid var(--primary-default)',
      paddingLeft: '0.75rem',
    },
    '.cm-hackmd-container-success': {
      borderLeft: '3px solid var(--success-default)',
    },
    '.cm-hackmd-container-warning': {
      borderLeft: '3px solid var(--warning-default)',
    },
    '.cm-hackmd-container-danger': {
      borderLeft: '3px solid var(--destructive-default)',
    },
    '.cm-hackmd-container-spoiler': {
      borderLeft: '3px solid var(--border-strong)',
    },
    '.cm-hackmd-tags-line, .cm-hackmd-toc-line, .cm-hackmd-blockquote-meta': {
      color: 'var(--text-subtle)',
      backgroundColor: 'var(--background-muted)',
    },
    '.cm-hackmd-hfm-fence, .cm-hackmd-code-fence-options, .cm-hackmd-math-block-line, .cm-hackmd-external-line': {
      color: 'var(--primary-default)',
      backgroundColor: 'var(--primary-soft)',
    },
    '.cm-hackmd-table-line': {
      color: 'var(--text-subtle)',
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
    '.cm-hackmd-mark': {
      borderRadius: '3px',
      backgroundColor: 'color-mix(in oklch, var(--warning-default) 24%, transparent)',
      color: 'var(--text-default)',
    },
    '.cm-hackmd-insert': {
      textDecoration: 'underline',
      textDecorationColor: 'var(--success-default)',
      textUnderlineOffset: '0.15em',
    },
    '.cm-hackmd-subscript': {
      fontSize: '0.82em',
      verticalAlign: 'sub',
    },
    '.cm-hackmd-superscript': {
      fontSize: '0.82em',
      verticalAlign: 'super',
    },
    '.cm-hackmd-ruby, .cm-hackmd-footnote-ref, .cm-hackmd-footnote-def, .cm-hackmd-abbr-def, .cm-hackmd-emoji, .cm-hackmd-definition-line': {
      color: 'var(--primary-default)',
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
    '.cm-hackmd-image-preview': {
      margin: '0.5rem 0 0.75rem 0.25rem',
      maxWidth: 'min(100%, 720px)',
      borderRadius: '6px',
      border: '1px solid var(--border-default)',
      backgroundColor: 'var(--background-muted)',
      padding: '0.5rem',
    },
    '.cm-hackmd-image-preview img': {
      display: 'block',
      maxWidth: '100%',
      height: 'auto',
      borderRadius: '4px',
    },
    '.cm-hackmd-image-preview figcaption': {
      marginTop: '0.35rem',
      color: 'var(--text-subtle)',
      fontFamily: 'var(--font-sans)',
      fontSize: '12px',
    },
    '.cm-hackmd-fallback-block': {
      margin: '0.35rem 0 0.65rem 0.25rem',
      borderRadius: '6px',
      border: '1px solid var(--border-default)',
      backgroundColor: 'var(--background-muted)',
      padding: '0.55rem 0.65rem',
      fontFamily: 'var(--font-sans)',
    },
    '.cm-hackmd-fallback-title': {
      color: 'var(--text-default)',
      fontSize: '12px',
      fontWeight: '650',
    },
    '.cm-hackmd-fallback-description': {
      marginTop: '0.15rem',
      color: 'var(--text-subtle)',
      fontSize: '12px',
    },
  }, { dark: true }),
];
