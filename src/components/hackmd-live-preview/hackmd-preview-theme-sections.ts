export const editorChromeTheme = {
  '&': {
    height: '100%',
    backgroundColor: 'var(--background-default)',
    color: 'var(--text-default)',
    '--hackmd-alert-note': '#0969da',
    '--hackmd-alert-tip': '#1a7f37',
    '--hackmd-alert-warning': '#9a6700',
    '--hackmd-alert-caution': '#d1242f',
    '--hackmd-alert-important': '#8250df',
    fontSize: '14px',
  },
  ':root.dark &': {
    '--hackmd-alert-note': '#2f81f7',
    '--hackmd-alert-tip': '#3fb950',
    '--hackmd-alert-warning': '#d29922',
    '--hackmd-alert-caution': '#f85149',
    '--hackmd-alert-important': '#a371f7',
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
  '.cm-panel.cm-vim-panel, .cm-panel.cm-hx-status-panel, .cm-panel.cm-hx-command-panel': {
    boxSizing: 'border-box',
    minHeight: '22px',
    padding: '1px 8px',
    borderTop: '1px solid var(--border-default)',
    backgroundColor: 'var(--background-muted)',
    color: 'var(--text-subtle)',
    fontFamily: 'var(--font-editor)',
    fontSize: '11px',
    lineHeight: '19px',
  },
  '.cm-panel.cm-hx-command-panel': {
    borderTop: '0',
  },
  '.cm-panel.cm-hx-command-panel:has(.cm-hx-command-panel-flex > span:first-child[style*="visibility: hidden"]):not(:has(.cm-hx-command-panel-flex > span:last-child:not(:empty)))': {
    display: 'none',
  },
  '.cm-hx-command-input': {
    color: 'var(--text-default)',
    caretColor: 'var(--primary-default)',
  },
  '.cm-hx-selected-option': {
    backgroundColor: 'var(--background-selected)',
    color: 'var(--text-default)',
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
  '.cm-hackmd-alert-block': {
    color: 'var(--text-default)',
    backgroundColor: 'transparent',
    boxShadow: 'inset .25em 0 0 #888',
    paddingInlineStart: '1rem',
    paddingInlineEnd: '0.75rem',
  },
  '.cm-hackmd-container-block': {
    color: 'var(--text-default)',
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 92%, var(--primary-default) 8%)',
    boxShadow: 'inset 4px 0 0 color-mix(in oklch, var(--primary-default) 72%, var(--border-strong) 28%)',
    paddingInlineStart: '1.15rem',
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
  '.cm-hackmd-alert-block-note, .cm-hackmd-alert-block-todo': {
    boxShadow: 'inset .25em 0 0 var(--hackmd-alert-note)',
  },
  '.cm-hackmd-alert-block-tip': {
    boxShadow: 'inset .25em 0 0 var(--hackmd-alert-tip)',
  },
  '.cm-hackmd-alert-block-important': {
    boxShadow: 'inset .25em 0 0 var(--hackmd-alert-important)',
  },
  '.cm-hackmd-alert-block-warning': {
    boxShadow: 'inset .25em 0 0 var(--hackmd-alert-warning)',
  },
  '.cm-hackmd-alert-block-caution, .cm-hackmd-alert-block-danger': {
    boxShadow: 'inset .25em 0 0 var(--hackmd-alert-caution)',
  },
  '.cm-hackmd-container-block-success': {
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 92%, var(--success-default) 8%)',
    boxShadow: 'inset 4px 0 0 var(--success-default)',
  },
  '.cm-hackmd-container-block-warning': {
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 90%, var(--warning-default) 10%)',
    boxShadow: 'inset 4px 0 0 var(--warning-default)',
  },
  '.cm-hackmd-container-block-danger': {
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 90%, var(--destructive-default) 10%)',
    boxShadow: 'inset 4px 0 0 var(--destructive-default)',
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
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'start',
  },
  '.cm-hackmd-ordered-list-marker': {
    color: 'var(--text-muted)',
  },
  '.cm-hackmd-task-checkbox': {
    display: 'inline-block',
    width: '0.95em',
    height: '0.95em',
    margin: '0 0.65em 0 0',
    verticalAlign: '-0.12em',
    accentColor: 'var(--primary-default)',
  },
  '.cm-hackmd-alert-heading': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.55rem',
    color: 'var(--primary-default)',
    fontFamily: 'var(--font-sans)',
    fontSize: '0.92em',
    fontWeight: '700',
    paddingBlock: '0.1rem 0.3rem',
  },
  '.cm-hackmd-alert-icon': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1.15em',
    height: '1.15em',
    border: '1.5px solid currentColor',
    borderRadius: '999px',
    fontSize: '0.78em',
    fontWeight: '800',
    lineHeight: '1',
  },
  '.cm-hackmd-alert-heading-tip': {
    color: 'var(--hackmd-alert-tip)',
  },
  '.cm-hackmd-alert-heading-important': {
    color: 'var(--hackmd-alert-important)',
  },
  '.cm-hackmd-alert-heading-note, .cm-hackmd-alert-heading-todo': {
    color: 'var(--hackmd-alert-note)',
  },
  '.cm-hackmd-alert-heading-warning': {
    color: 'var(--hackmd-alert-warning)',
  },
  '.cm-hackmd-alert-heading-caution, .cm-hackmd-alert-heading-danger': {
    color: 'var(--hackmd-alert-caution)',
  },
};

export const widgetTheme = {
  '.cm-hackmd-table': {
    maxWidth: '100%',
    overflowX: 'auto',
    contentVisibility: 'auto',
    containIntrinsicSize: 'auto none auto 180px',
    border: '1px solid var(--border-default)',
    borderRadius: '6px',
    backgroundColor: 'var(--background-default)',
    fontFamily: 'var(--font-sans)',
    padding: '0.45rem 0 0.75rem 0',
  },
  '.cm-hackmd-table table': {
    width: '100%',
    minWidth: 'max-content',
    borderCollapse: 'collapse',
  },
  '.cm-hackmd-table-caption': {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
  '.cm-hackmd-table th, .cm-hackmd-table td': {
    minWidth: '8rem',
    borderRight: '1px solid var(--border-default)',
    borderBottom: '1px solid var(--border-default)',
    padding: '0',
    verticalAlign: 'top',
  },
  '.cm-hackmd-table th:last-child, .cm-hackmd-table td:last-child': {
    borderRight: '0',
  },
  '.cm-hackmd-table tr:last-child td': {
    borderBottom: '0',
  },
  '.cm-hackmd-table th': {
    backgroundColor: 'var(--background-muted)',
    color: 'var(--text-default)',
    fontWeight: '650',
  },
  '.cm-hackmd-table-cell-source': {
    minHeight: '2rem',
    outline: 'none',
    padding: '0.45rem 0.6rem',
    whiteSpace: 'pre-wrap',
  },
  '.cm-hackmd-table-cell-source:focus': {
    backgroundColor: 'color-mix(in oklch, var(--background-selected) 36%, transparent)',
    boxShadow: 'inset 0 0 0 2px var(--focus-ring)',
  },
  '.cm-hackmd-csv-preview th, .cm-hackmd-csv-preview td': {
    minWidth: '7rem',
    padding: '0.42rem 0.58rem',
    color: 'var(--text-default)',
  },
  '.cm-hackmd-csv-preview td': {
    color: 'var(--text-muted)',
  },
  '.cm-hackmd-image-preview': {
    maxWidth: 'min(100%, 720px)',
    contentVisibility: 'auto',
    containIntrinsicSize: 'auto none auto 220px',
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
  '.cm-hackmd-rich-block': {
    maxWidth: 'min(100%, 820px)',
    contentVisibility: 'auto',
    containIntrinsicSize: 'auto none auto 220px',
    border: '1px solid var(--border-default)',
    borderRadius: '6px',
    backgroundColor: 'var(--background-muted)',
    boxShadow: 'inset 2px 0 0 color-mix(in oklch, var(--primary-default) 60%, var(--border-strong) 40%)',
    color: 'var(--text-default)',
    fontFamily: 'var(--font-sans)',
    overflow: 'auto',
    padding: '1.2rem 0.75rem 0.75rem 0.75rem',
  },
  '.cm-hackmd-rich-render-body': {
    minHeight: '1.5rem',
    color: 'var(--text-muted)',
  },
  '.cm-hackmd-rich-render-pending': {
    display: 'flex',
    alignItems: 'center',
    minHeight: '7rem',
    color: 'var(--text-subtle)',
    fontFamily: 'var(--font-sans)',
    fontSize: '13px',
  },
  '.cm-hackmd-rich-render-body svg': {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
  },
  '.cm-hackmd-rich-render-body .katex': {
    margin: '0',
    color: 'var(--text-default)',
  },
  '.cm-hackmd-rich-render-error': {
    borderColor: 'var(--destructive-default)',
    boxShadow: 'inset 2px 0 0 var(--destructive-default)',
  },
  '.cm-hackmd-rich-emoji': {
    display: 'inline-block',
    minWidth: '1em',
    textAlign: 'center',
  },
  '.cm-hackmd-rich-icon': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '1em',
    color: 'var(--primary-default)',
  },
  '.cm-hackmd-rich-icon-pending': {
    width: '1.25em',
    height: '1em',
    overflow: 'hidden',
    color: 'var(--text-subtle)',
    fontFamily: 'var(--font-sans)',
    fontSize: '0.95em',
  },
  '.cm-hackmd-rich-math-inline': {
    display: 'inline-flex',
    alignItems: 'center',
    maxWidth: '100%',
    color: 'var(--text-default)',
    verticalAlign: '-0.15em',
  },
  '.cm-hackmd-rich-math-inline .katex': {
    margin: '0',
  },
  '.cm-hackmd-rich-math-inline-pending': {
    minWidth: '2.5rem',
    color: 'var(--text-subtle)',
    fontFamily: 'var(--font-sans)',
    fontSize: '0.95em',
  },
};
