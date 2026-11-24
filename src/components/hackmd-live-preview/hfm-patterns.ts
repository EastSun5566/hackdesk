export const hfmFenceLanguages = new Set([
  'csvpreview',
  'sequence',
  'flow',
  'graphviz',
  'mermaid',
  'abc',
  'plantuml',
  'vega',
  'fretboard',
]);

export const externalEmbedPattern = /^\{%(youtube|vimeo|gist|slideshare|speakerdeck|pdf|figma)\s+(.+?)\s*%\}$/i;
// The alert types hackmd.io renders (GitHub's five, any case); other `[!word]` markers stay quotes.
export const alertLinePattern = /^ {0,3}>\s*\[!(note|tip|important|warning|caution)\]/i;
export const containerLinePattern = /^:::\s*(info|success|warning|danger|spoiler)\b/i;
export const blockquoteMetadataLinePattern = /^>\s*(?:\[[a-z]+=[^\]]+\]\s*)+$/i;
export const tableDelimiterPattern = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
export const fenceOpenPattern = /^(```|~~~)\s*([A-Za-z0-9_-]+)?(.*)$/;
