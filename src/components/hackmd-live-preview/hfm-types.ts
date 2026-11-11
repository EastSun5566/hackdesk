export type ImageSize = {
  unit: '%' | 'px';
  value: number;
};

export type ImageBlock = {
  alt: string;
  height?: ImageSize;
  lineFrom: number;
  lineTo: number;
  src: string;
  title?: string;
  width?: ImageSize;
};

export type HfmInlineMark = {
  /** Sanitized attributes for the mark's element (an inline colour, an abbreviation's title). */
  attributes?: Record<string, string>;
  className: string;
  from: number;
  to: number;
};

export type HfmHiddenRange = {
  from: number;
  to: number;
  /** Shown in place of the hidden source: `<br>` as a return glyph, `<summary>` as a disclosure mark. */
  widget?: 'disclosure' | 'line-break';
};

export type HfmLineDecorations = {
  hiddenRanges: HfmHiddenRange[];
  inlineMarks: HfmInlineMark[];
  lineClasses: string[];
};

export type HfmBlockRange = {
  endLine: number;
  kind: 'alert' | 'blockquote-meta' | 'container' | 'table';
  openerFrom: number;
  openerLine: number;
  openerTo: number;
  startLine: number;
  variant: string;
  closerFrom?: number;
  closerLine?: number;
  closerTo?: number;
};
