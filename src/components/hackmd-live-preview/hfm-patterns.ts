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

export const hfmFenceLabels: Record<string, string> = {
  abc: 'ABC notation block',
  csvpreview: 'CSV preview block',
  flow: 'Flow chart block',
  fretboard: 'Fretboard diagram block',
  graphviz: 'Graphviz diagram block',
  mermaid: 'Mermaid diagram block',
  plantuml: 'PlantUML diagram block',
  sequence: 'Sequence diagram block',
  vega: 'Vega-Lite chart block',
};

export const externalEmbedLabels: Record<string, string> = {
  figma: 'Figma embed',
  gist: 'Gist embed',
  pdf: 'PDF embed',
  slideshare: 'SlideShare embed',
  speakerdeck: 'Speaker Deck embed',
  vimeo: 'Vimeo embed',
  youtube: 'YouTube embed',
};

export const externalEmbedPattern = /^\{%(youtube|vimeo|gist|slideshare|speakerdeck|pdf|figma)\s+(.+?)\s*%\}$/i;
export const alertLinePattern = /^>\s*\[!(note|tip|important|warning|caution|danger|todo)\]/i;
export const containerLinePattern = /^:::\s*(info|success|warning|danger|spoiler)\b/i;
export const blockquoteMetadataLinePattern = /^>\s*(?:\[[a-z]+=[^\]]+\]\s*)+$/i;
export const tableDelimiterPattern = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
export const fenceOpenPattern = /^(```|~~~)\s*([A-Za-z0-9_-]+)?(.*)$/;
