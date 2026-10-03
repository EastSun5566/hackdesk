export function escapeMarkdownAltText(alt: string) {
  return alt.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

export function formatMarkdownImage(alt: string, url: string) {
  return `![${escapeMarkdownAltText(alt || 'image')}](${url})`;
}

export const IMAGE_UPLOAD_PROGRESS_TEXT = '![Inserting image...]()';

/** A unique placeholder lets an upload finish in its own note after the editor is gone. */
export function createImageUploadPlaceholder() {
  return `![Uploading image ${crypto.randomUUID().slice(0, 8)}...]()`;
}
