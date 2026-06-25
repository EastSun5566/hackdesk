export const editorChromeTheme = {
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
    lineHeight: '1.72',
  },
  '.cm-content': {
    padding: '24px clamp(24px, 4vw, 52px) 36vh',
    caretColor: 'var(--primary-default)',
    minWidth: '0',
  },
  '.cm-line': {
    padding: '0',
    overflowWrap: 'anywhere',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklch, var(--background-selected) 18%, transparent)',
  },
  '.cm-activeLine.cm-hackmd-fenced-code': {
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 96%, var(--primary-default) 4%)',
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
    backgroundColor: 'color-mix(in oklch, var(--primary-default) 22%, transparent)',
  },
};

export const searchPanelTheme = {
  '.cm-panels': {
    backgroundColor: 'var(--background-muted)',
    color: 'var(--text-default)',
    borderColor: 'var(--border-default)',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-panel.cm-search.cm-hackdesk-search-panel': {
    borderBottom: '1px solid var(--border-default)',
    padding: '6px 8px',
  },
  '.cm-hackdesk-search-form': {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  '.cm-hackdesk-search-input': {
    minWidth: '0',
    flex: '1 1 auto',
    height: '28px',
    border: '1px solid var(--border-default)',
    borderRadius: '6px',
    backgroundColor: 'var(--background-default)',
    color: 'var(--text-default)',
    fontFamily: 'var(--font-sans)',
    fontSize: '12px',
    outline: 'none',
    padding: '0 9px',
    transition: 'border-color 120ms ease, box-shadow 120ms ease',
  },
  '.cm-hackdesk-search-input:focus': {
    borderColor: 'var(--focus-ring)',
    boxShadow: '0 0 0 2px color-mix(in oklch, var(--focus-ring) 26%, transparent)',
  },
  '.cm-hackdesk-search-input::placeholder': {
    color: 'var(--text-subtle)',
  },
  '.cm-hackdesk-search-count': {
    flex: '0 0 auto',
    minWidth: '42px',
    color: 'var(--text-subtle)',
    fontFamily: 'var(--font-sans)',
    fontSize: '11px',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },
  '.cm-hackdesk-search-button': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    flex: '0 0 auto',
    border: '1px solid transparent',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: 'var(--icon-subtle)',
    cursor: 'default',
    padding: '0',
    transition: 'background-color 120ms ease, border-color 120ms ease, color 120ms ease',
  },
  '.cm-hackdesk-search-button:hover': {
    backgroundColor: 'var(--background-hover)',
    color: 'var(--icon-default)',
  },
  '.cm-hackdesk-search-button:focus-visible': {
    borderColor: 'var(--focus-ring)',
    color: 'var(--icon-default)',
    outline: 'none',
  },
  '.cm-hackdesk-search-button svg': {
    width: '15px',
    height: '15px',
  },
  '.cm-searchMatch': {
    borderRadius: '3px',
    backgroundColor: 'color-mix(in oklch, var(--primary-default) 26%, transparent)',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in oklch, var(--primary-default) 46%, transparent)',
    outline: '1px solid color-mix(in oklch, var(--primary-default) 72%, transparent)',
  },
};

export const proseTheme = {
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
    left: '0',
    right: '0',
    top: '50%',
    borderTop: '1px solid var(--border-default)',
    pointerEvents: 'none',
  },
};

export const codeAndBlockTheme = {
  '.cm-hackmd-fenced-code': {
    fontFamily: 'var(--font-editor)',
    backgroundColor: 'color-mix(in oklch, var(--background-default) 78%, black 22%)',
    boxShadow: [
      'inset 2px 0 0 color-mix(in oklch, var(--border-strong) 82%, var(--primary-default) 18%)',
      'inset 0 1px 0 color-mix(in oklch, var(--border-default) 46%, transparent)',
    ].join(', '),
    paddingInline: '0.875rem',
  },
  '.cm-hackmd-alert-block, .cm-hackmd-container-block': {
    color: 'var(--text-default)',
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 86%, var(--primary-default) 14%)',
    boxShadow: 'inset 3px 0 0 color-mix(in oklch, var(--primary-default) 68%, var(--border-strong) 32%)',
    paddingInlineStart: '0.9rem',
    paddingInlineEnd: '0.75rem',
  },
  '.cm-hackmd-alert-block-start, .cm-hackmd-container-block-start': {
    borderStartStartRadius: '6px',
    borderStartEndRadius: '6px',
    paddingTop: '0.12rem',
  },
  '.cm-hackmd-alert-block-end, .cm-hackmd-container-block-end': {
    borderEndStartRadius: '6px',
    borderEndEndRadius: '6px',
    paddingBottom: '0.12rem',
  },
  '.cm-hackmd-alert-block-tip, .cm-hackmd-container-block-success': {
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 86%, var(--success-default) 14%)',
    boxShadow: 'inset 3px 0 0 var(--success-default)',
  },
  '.cm-hackmd-alert-block-warning, .cm-hackmd-alert-block-caution, .cm-hackmd-container-block-warning': {
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 86%, var(--warning-default) 14%)',
    boxShadow: 'inset 3px 0 0 var(--warning-default)',
  },
  '.cm-hackmd-alert-block-danger, .cm-hackmd-container-block-danger': {
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 86%, var(--destructive-default) 14%)',
    boxShadow: 'inset 3px 0 0 var(--destructive-default)',
  },
  '.cm-hackmd-container-block-spoiler': {
    backgroundColor: 'var(--background-muted)',
    boxShadow: 'inset 3px 0 0 var(--border-strong)',
  },
  '.cm-hackmd-table-block': {
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 88%, var(--primary-default) 12%)',
    boxShadow: 'inset 2px 0 0 color-mix(in oklch, var(--border-strong) 76%, var(--primary-default) 24%)',
    paddingInlineStart: '0.75rem',
    paddingInlineEnd: '0.75rem',
  },
  '.cm-hackmd-table-block-start': {
    borderStartStartRadius: '6px',
    borderStartEndRadius: '6px',
    paddingTop: '0.1rem',
  },
  '.cm-hackmd-table-block-end': {
    borderEndStartRadius: '6px',
    borderEndEndRadius: '6px',
    paddingBottom: '0.1rem',
  },
  '.cm-hackmd-blockquote-meta-block': {
    color: 'var(--text-subtle)',
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 88%, var(--primary-default) 12%)',
    boxShadow: 'inset 3px 0 0 color-mix(in oklch, var(--primary-default) 52%, var(--border-strong) 48%)',
    paddingInlineStart: '0.85rem',
  },
  '.cm-hackmd-blockquote-meta-block-start': {
    borderStartStartRadius: '6px',
    borderStartEndRadius: '6px',
    paddingTop: '0.1rem',
  },
  '.cm-hackmd-blockquote-meta-block-end': {
    borderEndStartRadius: '6px',
    borderEndEndRadius: '6px',
    paddingBottom: '0.1rem',
  },
  '.cm-hackmd-tags-line, .cm-hackmd-toc-line, .cm-hackmd-blockquote-meta': {
    color: 'var(--text-subtle)',
    backgroundColor: 'var(--background-muted)',
  },
  '.cm-hackmd-hfm-fence, .cm-hackmd-code-fence-options, .cm-hackmd-math-block-line, .cm-hackmd-external-line': {
    color: 'var(--text-subtle)',
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 88%, var(--primary-default) 12%)',
    boxShadow: 'inset 2px 0 0 color-mix(in oklch, var(--primary-default) 55%, var(--border-strong) 45%)',
    paddingInlineStart: '0.75rem',
  },
  '.cm-hackmd-indented-code': {
    color: 'var(--text-subtle)',
    backgroundColor: 'color-mix(in oklch, var(--background-default) 82%, black 18%)',
    boxShadow: 'inset 2px 0 0 var(--border-strong)',
    paddingInlineStart: '0.875rem',
  },
  '.cm-hackmd-table-line': {
    color: 'var(--text-subtle)',
    backgroundColor: 'var(--background-muted)',
  },
};

export const inlineMarksTheme = {
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
  '.cm-hackmd-ruby, .cm-hackmd-footnote-ref, .cm-hackmd-footnote-def, .cm-hackmd-abbr-def, .cm-hackmd-reference-def, .cm-hackmd-reference-link, .cm-hackmd-inline-footnote, .cm-hackmd-autolink, .cm-hackmd-emoji, .cm-hackmd-definition-line': {
    color: 'var(--primary-default)',
  },
  '.cm-hackmd-fence-meta, .cm-hackmd-container-meta': {
    color: 'var(--text-subtle)',
    fontStyle: 'italic',
  },
  '.cm-hackmd-inline-math': {
    color: 'var(--primary-default)',
    fontStyle: 'italic',
    textDecoration: 'underline',
    textDecorationColor: 'color-mix(in oklch, var(--primary-default) 32%, transparent)',
    textUnderlineOffset: '0.16em',
  },
  '.cm-hackmd-raw-html': {
    color: 'var(--text-subtle)',
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 70%, transparent)',
    borderRadius: '3px',
  },
  '.cm-hackmd-typographer': {
    color: 'var(--text-subtle)',
    textDecoration: 'underline',
    textDecorationColor: 'color-mix(in oklch, var(--text-subtle) 35%, transparent)',
    textUnderlineOffset: '0.16em',
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
};

export const widgetTheme = {
  '.cm-hackmd-image-preview': {
    margin: '0.4rem 0 0.65rem 0.25rem',
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
    margin: '0.2rem 0 0.45rem 0.25rem',
    maxWidth: 'min(100%, 36rem)',
    borderRadius: '5px',
    border: '1px solid var(--border-default)',
    borderLeft: '2px solid color-mix(in oklch, var(--primary-default) 58%, var(--border-strong) 42%)',
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 88%, transparent)',
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    padding: '0.42rem 0.55rem',
  },
  '.cm-hackmd-fallback-block:focus-visible': {
    outline: '2px solid var(--focus-ring)',
    outlineOffset: '2px',
  },
  '.cm-hackmd-fallback-title': {
    color: 'var(--text-default)',
    fontSize: '11px',
    fontWeight: '650',
  },
  '.cm-hackmd-fallback-description': {
    marginTop: '0.08rem',
    color: 'var(--text-subtle)',
    fontSize: '11px',
  },
};
