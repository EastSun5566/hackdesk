import { EDITOR_CONTENT_MAX_WIDTH, EDITOR_CONTENT_WIDTH, EDITOR_SIDE_PADDING } from './editor-content-layout';
export { EDITOR_LINE_WIDTH } from './editor-content-layout';

const EDITOR_CONTROL_HEIGHT = '32px';
const EDITOR_CONTROL_RADIUS = '6px';
const EDITOR_FOCUS_RING = '0 0 0 2px color-mix(in oklch, var(--focus-ring) 26%, transparent)';
const CODE_PANEL_BACKGROUND = 'color-mix(in oklch, var(--background-muted) 92%, var(--text-default) 8%)';
export const EDITOR_SELECTION_BACKGROUND = 'color-mix(in srgb, var(--primary-default) 24%, transparent)';
const EDITOR_BLOCK_CURSOR_BACKGROUND = 'color-mix(in srgb, var(--primary-default) 55%, transparent)';

export const editorChromeTheme = {
  '&': {
    height: '100%',
    isolation: 'isolate',
    backgroundColor: 'var(--background-default)',
    color: 'var(--text-default)',
    fontSize: 'var(--font-size-ui)',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-editor)',
    fontSize: 'var(--font-size-editor)',
    lineHeight: '1.6',
  },
  '.cm-content': {
    padding: `24px ${EDITOR_SIDE_PADDING} 36vh`,
    // CodeMirror draws selections up to the content box, so the column is a
    // centered max-width box rather than padding inside a full-width one.
    width: EDITOR_CONTENT_WIDTH,
    maxWidth: EDITOR_CONTENT_MAX_WIDTH,
    marginInline: 'auto',
    boxSizing: 'border-box',
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
    outline: '1px solid var(--focus-ring)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'var(--primary-default)',
  },
  // drawSelection paints selections behind the text. These selectors match the
  // specificity of CodeMirror's base theme, which would otherwise win.
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: EDITOR_SELECTION_BACKGROUND,
  },
  // The native selection is hidden in the content; keep the text color instead
  // of the app-wide selection foreground.
  '.cm-content ::selection, .cm-content::selection': {
    color: 'currentcolor',
  },
  // Kakoune mode hides the drawn selection with a base-theme rule that stays in the document
  // after the mode is switched off, which would leave every other mode without a visible
  // selection until reload. Show it again everywhere Kakoune isn't running.
  '&:not([data-kakoune-mode]) .cm-selectionLayer > .cm-selectionBackground': {
    display: 'block',
  },
  // Kakoune marks its selections inline instead, in CodeMirror's default grey.
  '& .cm-content .cm-kakoune-selection': {
    backgroundColor: EDITOR_SELECTION_BACKGROUND,
  },
  '&[data-kakoune-mode]': {
    '--caret-color': 'var(--primary-default)',
  },
  // Block cursors (Vim, Helix) ship their own fixed colors; tint them with the primary instead,
  // a step stronger than the selection so the cursor stays findable inside one.
  '&.cm-editor .cm-fat-cursor, &.cm-editor .cm-hx-block-cursor .cm-hx-cursor': {
    background: EDITOR_BLOCK_CURSOR_BACKGROUND,
  },
  '&:not(.cm-focused).cm-editor .cm-fat-cursor': {
    background: 'none',
    outline: '1px solid var(--primary-default)',
  },
};

export const searchPanelTheme = {
  // Panels sit inside the note card, so they share its surface. Each panel draws its own divider;
  // the container draws none, or the edge between it and its first panel would be a double line.
  '.cm-panels': {
    backgroundColor: 'var(--background-default)',
    color: 'var(--text-default)',
    borderColor: 'var(--border-subtle)',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '0',
  },
  '.cm-panels.cm-panels-bottom': {
    borderTop: '0',
  },
  '.cm-panel.cm-vim-panel, .cm-panel.cm-hx-status-panel, .cm-panel.cm-hx-command-panel, .cm-panel.cm-kakoune-status-panel': {
    boxSizing: 'border-box',
    minHeight: EDITOR_CONTROL_HEIGHT,
    // Text lines up with the note header's breadcrumb above it.
    padding: '0 16px',
    borderTop: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--background-default)',
    color: 'var(--text-subtle)',
    fontFamily: 'var(--font-mono)',
    // The chrome's meta size (12px at the default 14px UI), not a fraction of the editor font.
    fontSize: 'calc(var(--font-size-ui) - 2px)',
    lineHeight: 'normal',
  },
  '.cm-panel.cm-vim-panel, .cm-panel.cm-hx-status-panel, .cm-panel.cm-kakoune-status-panel': {
    display: 'flex',
    alignItems: 'center',
  },
  '.cm-panel.cm-hx-command-panel': {
    borderTop: '0',
  },
  '.cm-panel.cm-hx-command-panel:has(.cm-hx-command-panel-flex > span:first-child[style*="visibility: hidden"]):not(:has(.cm-hx-command-panel-flex > span:last-child:not(:empty)))': {
    display: 'none',
  },
  '.cm-hx-command-input': {
    boxSizing: 'border-box',
    minWidth: '0',
    height: EDITOR_CONTROL_HEIGHT,
    border: '1px solid var(--border-default)',
    borderRadius: EDITOR_CONTROL_RADIUS,
    backgroundColor: 'var(--background-default)',
    color: 'var(--text-default)',
    caretColor: 'var(--primary-default)',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    padding: '0 9px',
    transition: 'border-color 120ms ease, box-shadow 120ms ease',
  },
  '.cm-panel.cm-vim-panel input': {
    boxSizing: 'border-box',
    minWidth: '0',
    height: EDITOR_CONTROL_HEIGHT,
    border: '1px solid var(--border-default)',
    borderRadius: EDITOR_CONTROL_RADIUS,
    backgroundColor: 'var(--background-default)',
    color: 'var(--text-default)',
    caretColor: 'var(--primary-default)',
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    padding: '0 9px',
    transition: 'border-color 120ms ease, box-shadow 120ms ease',
  },
  '.cm-hx-command-input:focus, .cm-panel.cm-vim-panel input:focus': {
    borderColor: 'var(--focus-ring)',
    boxShadow: EDITOR_FOCUS_RING,
  },
  '.cm-hx-command-popup': {
    overflow: 'hidden',
    border: '1px solid var(--border-default)',
    borderRadius: EDITOR_CONTROL_RADIUS,
    backgroundColor: 'var(--background-default)',
    color: 'var(--text-default)',
  },
  '.cm-hx-command-help': {
    border: '0',
    borderBottom: '1px solid var(--border-default)',
    backgroundColor: 'var(--background-muted)',
    color: 'var(--text-subtle)',
  },
  '.cm-hx-command-autocomplete': {
    backgroundColor: 'var(--background-default)',
  },
  '.cm-hx-selected-option': {
    backgroundColor: 'var(--background-selected)',
    color: 'var(--text-default)',
  },
  '.cm-panel.cm-search.cm-hackdesk-search-panel': {
    borderBottom: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--background-default)',
    padding: '8px',
  },
  '.cm-hackdesk-search-form': {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  '.cm-hackdesk-search-input': {
    minWidth: '0',
    flex: '1 1 auto',
    height: EDITOR_CONTROL_HEIGHT,
    border: '1px solid var(--border-default)',
    borderRadius: EDITOR_CONTROL_RADIUS,
    backgroundColor: 'var(--background-default)',
    color: 'var(--text-default)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--font-size-ui)',
    outline: 'none',
    padding: '0 9px',
    transition: 'border-color 120ms ease, box-shadow 120ms ease',
  },
  '.cm-hackdesk-search-input:focus': {
    borderColor: 'var(--focus-ring)',
    boxShadow: EDITOR_FOCUS_RING,
  },
  '.cm-hackdesk-search-input::placeholder': {
    color: 'var(--text-subtle)',
  },
  '.cm-hackdesk-search-count': {
    flex: '0 0 auto',
    minWidth: '42px',
    color: 'var(--text-subtle)',
    fontFamily: 'var(--font-sans)',
    fontSize: '0.875em',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },
  '.cm-hackdesk-search-button': {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: EDITOR_CONTROL_HEIGHT,
    height: EDITOR_CONTROL_HEIGHT,
    flex: '0 0 auto',
    border: '1px solid var(--border-default)',
    borderRadius: EDITOR_CONTROL_RADIUS,
    backgroundColor: 'var(--background-default)',
    color: 'var(--icon-subtle)',
    cursor: 'default',
    padding: '0',
    transition: 'background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, color 120ms ease',
  },
  '.cm-hackdesk-search-button:hover': {
    backgroundColor: 'var(--element-bg-hover)',
    color: 'var(--icon-default)',
  },
  '.cm-hackdesk-search-button:active': {
    backgroundColor: 'var(--background-selected)',
    color: 'var(--icon-default)',
  },
  '.cm-hackdesk-search-button:focus-visible': {
    borderColor: 'var(--focus-ring)',
    color: 'var(--icon-default)',
    outline: 'none',
    boxShadow: EDITOR_FOCUS_RING,
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
    outline: '1px solid color-mix(in oklch, var(--focus-ring) 72%, transparent)',
  },
  '.cm-hackmd-initial-reveal-match': {
    borderRadius: '3px',
    backgroundColor: 'color-mix(in oklch, var(--primary-default) 34%, transparent)',
    boxShadow: '0 0 0 1px color-mix(in oklch, var(--focus-ring) 38%, transparent)',
  },
};

export const proseTheme = {
  // Headings sit close to the body size and lean on weight, the way Obsidian's Minimal theme does,
  // so a long note reads as one column. Markdown already leaves a blank line before a heading, so
  // headings add only a touch of space of their own; more would double the gap. H1 keeps one clear
  // step because it usually names the note. Line padding (not margin) keeps CodeMirror's height
  // map exact.
  '.cm-hackmd-h1': {
    fontSize: '1.2em',
    fontWeight: '600',
    lineHeight: '1.35',
    letterSpacing: '-0.01em',
    paddingTop: '0.2em',
    color: 'var(--text-default)',
  },
  '.cm-hackmd-h2': {
    fontSize: '1.1em',
    fontWeight: '600',
    lineHeight: '1.4',
    paddingTop: '0.15em',
    color: 'var(--text-default)',
  },
  '.cm-hackmd-h3': {
    fontSize: '1.05em',
    fontWeight: '600',
    lineHeight: '1.45',
    color: 'var(--text-default)',
  },
  '.cm-hackmd-h4': {
    fontWeight: '600',
    color: 'var(--text-default)',
  },
  '.cm-hackmd-h5, .cm-hackmd-h6': {
    fontSize: '0.9em',
    fontWeight: '600',
    color: 'var(--text-subtle)',
  },
  '.cm-hackmd-blockquote': {
    color: 'var(--text-subtle)',
    borderLeft: '3px solid var(--border-bold)',
    paddingLeft: '0.75rem',
  },
  '.cm-hackmd-frontmatter': {
    color: 'var(--text-subtle)',
    backgroundColor: 'var(--background-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.88em',
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
  // A fence is one quiet panel: a flat tint with rounded ends, no stripe. Text the language does not
  // colour stays in the body colour; the token colours come from the theme's --code-* palette.
  '.cm-hackmd-fenced-code': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.88em',
    color: 'var(--text-default)',
    backgroundColor: CODE_PANEL_BACKGROUND,
    paddingInline: '1rem',
  },
  // Code lines are a fractional number of pixels tall, so neighbouring line backgrounds can leave an
  // anti-aliased seam. A 1px shadow of the panel colour under each line but the last fills it.
  '.cm-hackmd-fenced-code:not(.cm-hackmd-code-footer, .cm-hackmd-code-last), .cm-hackmd-indented-code': {
    boxShadow: `0 1px 0 ${CODE_PANEL_BACKGROUND}`,
  },
  '.cm-hackmd-code-header': {
    borderStartStartRadius: '6px',
    borderStartEndRadius: '6px',
    paddingTop: '0.2em',
  },
  // Away from the cursor, the opening fence is a slim header carrying the language on the right.
  '.cm-hackmd-code-header-collapsed': {
    fontFamily: 'var(--font-sans)',
    fontSize: '0.75em',
    lineHeight: '1.5',
    paddingTop: '0.45em',
    textAlign: 'right',
  },
  '.cm-hackmd-code-label': {
    color: 'var(--text-subtle)',
    letterSpacing: '0.01em',
    userSelect: 'none',
  },
  '.cm-hackmd-code-footer, .cm-hackmd-code-last': {
    borderEndStartRadius: '6px',
    borderEndEndRadius: '6px',
    paddingBottom: '0.2em',
  },
  // ...and the closing fence is just the panel's bottom padding.
  '.cm-hackmd-code-footer-collapsed': {
    fontSize: '0.5em',
    lineHeight: '1',
    paddingBottom: '0.6em',
  },
  // HackMD's `=`, `=N` and `=+` fences number their lines in a gutter inside the panel.
  '.cm-hackmd-code-numbered': {
    position: 'relative',
    paddingInlineStart: 'calc(1rem + var(--cm-code-gutter, 2ch) + 1.5ch)',
  },
  '.cm-hackmd-code-numbered::before': {
    content: 'attr(data-line-number)',
    position: 'absolute',
    left: '1rem',
    width: 'var(--cm-code-gutter, 2ch)',
    color: 'var(--text-subtle)',
    opacity: '0.7',
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  // Alerts and containers mark their edge with a real left border, as HackMD and GitHub do. An inset
  // box-shadow on a rounded line bleeds a hairline across every line edge, and alert lines are also
  // blockquote lines, whose own border would double the bar; this border replaces it.
  '.cm-hackmd-alert-block': {
    color: 'var(--text-default)',
    backgroundColor: 'transparent',
    borderLeft: '0.25em solid var(--border-bold)',
    paddingInlineStart: '1rem',
    paddingInlineEnd: '0.75rem',
  },
  '.cm-hackmd-container-block': {
    color: 'var(--text-default)',
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 92%, var(--primary-default) 8%)',
    borderLeft: '3px solid color-mix(in oklch, var(--primary-default) 72%, var(--border-bold) 28%)',
    paddingInlineStart: '1rem',
    paddingInlineEnd: '0.75rem',
  },
  '.cm-hackmd-alert-block-start, .cm-hackmd-container-block-start': {
    paddingTop: '0.12rem',
  },
  '.cm-hackmd-alert-block-end, .cm-hackmd-container-block-end': {
    paddingBottom: '0.12rem',
  },
  // Only the tinted container has a surface to round, and only on the side away from its border.
  '.cm-hackmd-container-block-start': {
    borderStartEndRadius: '6px',
  },
  '.cm-hackmd-container-block-end': {
    borderEndEndRadius: '6px',
  },
  '.cm-hackmd-alert-block-note, .cm-hackmd-alert-block-todo': {
    borderLeftColor: 'var(--link-text-default)',
  },
  '.cm-hackmd-alert-block-tip': {
    borderLeftColor: 'var(--success-default)',
  },
  '.cm-hackmd-alert-block-important': {
    borderLeftColor: 'var(--primary-default)',
  },
  '.cm-hackmd-alert-block-warning': {
    borderLeftColor: 'var(--warning-default)',
  },
  '.cm-hackmd-alert-block-caution, .cm-hackmd-alert-block-danger': {
    borderLeftColor: 'var(--destructive-default)',
  },
  '.cm-hackmd-container-block-success': {
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 92%, var(--success-default) 8%)',
    borderLeftColor: 'var(--success-default)',
  },
  '.cm-hackmd-container-block-warning': {
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 90%, var(--warning-default) 10%)',
    borderLeftColor: 'var(--warning-default)',
  },
  '.cm-hackmd-container-block-danger': {
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 90%, var(--destructive-default) 10%)',
    borderLeftColor: 'var(--destructive-default)',
  },
  '.cm-hackmd-container-block-spoiler': {
    backgroundColor: 'var(--background-muted)',
    borderLeftColor: 'var(--border-bold)',
  },
  '.cm-hackmd-table-block': {
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 88%, var(--primary-default) 12%)',
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
  // `[name=]`, `[time=]` and `[color=]` lines belong to the blockquote around them; they take its
  // border and colour instead of a tinted band of their own.
  '.cm-hackmd-blockquote-meta-block': {
    color: 'var(--text-subtle)',
  },
  '.cm-hackmd-tags-line, .cm-hackmd-toc-line': {
    color: 'var(--text-subtle)',
    backgroundColor: 'var(--background-muted)',
  },
  '.cm-hackmd-blockquote-meta': {
    color: 'var(--text-subtle)',
  },
  '.cm-hackmd-math-block-line, .cm-hackmd-external-line': {
    color: 'var(--text-subtle)',
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 88%, var(--primary-default) 12%)',
    borderLeft: '2px solid color-mix(in oklch, var(--primary-default) 55%, var(--border-bold) 45%)',
    paddingInlineStart: '0.75rem',
  },
  '.cm-hackmd-indented-code': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.88em',
    color: 'var(--text-subtle)',
    backgroundColor: CODE_PANEL_BACKGROUND,
    paddingInline: '1rem',
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
    fontFamily: 'var(--font-mono)',
    fontSize: '0.88em',
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
  '.cm-hackmd-link-open': {
    appearance: 'none',
    border: '0',
    borderRadius: '3px',
    backgroundColor: 'transparent',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '1.35em',
    height: '1.35em',
    marginInlineStart: '0.24em',
    color: 'var(--icon-subtle)',
    cursor: 'pointer',
    fontFamily: 'var(--font-sans)',
    fontSize: '0.95em',
    lineHeight: '1',
    opacity: '0.72',
    padding: '0',
    transition: 'background-color 120ms ease, color 120ms ease, opacity 120ms ease',
    verticalAlign: '0.02em',
  },
  '.cm-hackmd-link-open::before': {
    content: '"↗"',
  },
  '.cm-hackmd-link-open:hover': {
    backgroundColor: 'color-mix(in oklch, var(--link-text-default) 10%, transparent)',
    color: 'var(--link-text-default)',
    opacity: '1',
  },
  '.cm-hackmd-link-open:focus-visible': {
    outline: '1px solid var(--focus-ring)',
    outlineOffset: '1px',
    color: 'var(--link-text-default)',
    opacity: '1',
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
    fontFamily: 'var(--font-mono)',
    fontSize: '0.88em',
    color: 'var(--text-subtle)',
    backgroundColor: 'color-mix(in oklch, var(--background-muted) 70%, transparent)',
    borderRadius: '3px',
  },
  '.cm-hackmd-list-marker': {
    display: 'inline-block',
    width: '0.9em',
    marginRight: '0.3em',
    color: 'var(--text-subtle)',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
  },
  // A drawn dot, centred on the x-height: about a third of an em, the size of a browser's disc at
  // body text size. Deeper levels switch to a ring, then a square, like nested HTML lists.
  '.cm-hackmd-bullet': {
    // Centred in the marker slot, the dot keeps about half an em from the text, as a browser's does.
    textAlign: 'center',
  },
  '.cm-hackmd-bullet::before': {
    content: '""',
    display: 'inline-block',
    boxSizing: 'border-box',
    width: '0.36em',
    height: '0.36em',
    borderRadius: '50%',
    backgroundColor: 'currentColor',
    verticalAlign: '0.16em',
  },
  '.cm-hackmd-bullet-circle::before': {
    backgroundColor: 'transparent',
    border: '0.075em solid currentColor',
  },
  '.cm-hackmd-bullet-square::before': {
    width: '0.32em',
    height: '0.32em',
    borderRadius: '1px',
  },
  '.cm-hackmd-ordered-list-marker': {
    color: 'var(--text-subtle)',
    textAlign: 'right',
  },
  '.cm-hackmd-task-checkbox': {
    display: 'inline-block',
    width: '0.9em',
    height: '0.9em',
    margin: '0 0.3em 0 0',
    verticalAlign: '-0.15em',
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
    color: 'var(--success-default)',
  },
  '.cm-hackmd-alert-heading-important': {
    color: 'var(--primary-default)',
  },
  '.cm-hackmd-alert-heading-note, .cm-hackmd-alert-heading-todo': {
    color: 'var(--link-text-default)',
  },
  '.cm-hackmd-alert-heading-warning': {
    color: 'var(--warning-default)',
  },
  '.cm-hackmd-alert-heading-caution, .cm-hackmd-alert-heading-danger': {
    color: 'var(--destructive-default)',
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
  '.cm-hackmd-table-cell-mark': {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
  '.cm-hackmd-table-cell-strong': {
    fontWeight: '700',
  },
  '.cm-hackmd-table-cell-em': {
    fontStyle: 'italic',
  },
  '.cm-hackmd-table-cell-strike': {
    textDecoration: 'line-through',
    textDecorationColor: 'var(--text-subtle)',
  },
  '.cm-hackmd-table-cell-inline-code': {
    borderRadius: '4px',
    backgroundColor: 'var(--primary-soft)',
    color: 'var(--primary-default)',
    fontFamily: 'var(--font-mono)',
    padding: '0 0.2em',
  },
  '.cm-hackmd-table-cell-link': {
    color: 'var(--link-text-default)',
    textDecoration: 'underline',
    textDecorationColor: 'color-mix(in oklch, var(--link-text-default) 45%, transparent)',
    textUnderlineOffset: '0.15em',
  },
  '.cm-hackmd-csv-preview th, .cm-hackmd-csv-preview td': {
    minWidth: '7rem',
    padding: '0.42rem 0.58rem',
    color: 'var(--text-default)',
  },
  '.cm-hackmd-csv-preview td': {
    color: 'var(--text-subtle)',
  },
  // A figure is the image itself: no frame, tint or padding around it. Vertical rhythm comes from
  // padding (not margin), which CodeMirror's height map measures.
  '.cm-hackmd-image-preview': {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    margin: '0',
    padding: '0.5em 0',
    contentVisibility: 'auto',
    containIntrinsicSize: 'auto none auto 220px',
  },
  '.cm-hackmd-image-preview img': {
    display: 'block',
    maxWidth: '100%',
    height: 'auto',
    borderRadius: '6px',
    cursor: 'text',
  },
  '.cm-hackmd-image-preview img[hidden]': {
    display: 'none',
  },
  '.cm-hackmd-image-preview figcaption': {
    maxWidth: '100%',
    marginTop: '0.5em',
    color: 'var(--text-subtle)',
    fontSize: '0.875em',
    lineHeight: '1.45',
    textWrap: 'pretty',
  },
  '.cm-hackmd-image-unavailable': {
    display: 'inline-block',
    borderRadius: '6px',
    backgroundColor: 'var(--background-muted)',
    color: 'var(--text-subtle)',
    fontSize: '0.875em',
    padding: '0.35em 0.65em',
  },
  '.cm-hackmd-image-unavailable[hidden]': {
    display: 'none',
  },
  // Rendered math and diagrams stand on the page like the images do: no frame, tint or accent stripe.
  '.cm-hackmd-rich-block': {
    maxWidth: 'min(100%, 820px)',
    contentVisibility: 'auto',
    containIntrinsicSize: 'auto none auto 220px',
    color: 'var(--text-default)',
    fontFamily: 'var(--font-sans)',
    overflow: 'auto',
    padding: '0.5rem 0',
  },
  '.cm-hackmd-rich-render-body': {
    minHeight: '1.5rem',
    color: 'var(--text-subtle)',
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
  '.cm-hackmd-rich-render-error, .cm-hackmd-rich-render-error .cm-hackmd-rich-render-body': {
    color: 'var(--destructive-default)',
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
