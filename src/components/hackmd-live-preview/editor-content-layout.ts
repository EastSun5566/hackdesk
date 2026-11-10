/** Shared content geometry for the editor and its loading placeholder. */
// 46em reads as about 75 characters of prose at any font size.
export const EDITOR_LINE_WIDTH = '46em';
export const EDITOR_SIDE_PADDING = 'clamp(20px, 6%, 48px)';
export const EDITOR_CONTENT_WIDTH = `min(100%, calc(${EDITOR_LINE_WIDTH} + 2 * ${EDITOR_SIDE_PADDING}))`;
export const EDITOR_CONTENT_MAX_WIDTH = `calc(${EDITOR_LINE_WIDTH} + 2 * ${EDITOR_SIDE_PADDING})`;
