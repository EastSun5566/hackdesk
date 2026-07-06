export function escapeMarkdownAltText(alt: string) {
  return alt.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

export function formatMarkdownImage(alt: string, url: string) {
  return `![${escapeMarkdownAltText(alt || 'image')}](${url})`;
}
