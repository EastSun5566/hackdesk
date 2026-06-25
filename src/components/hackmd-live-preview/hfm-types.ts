export type ImageBlock = {
  alt: string;
  height?: number;
  lineTo: number;
  src: string;
  width?: number;
};

export type HfmInlineMark = {
  className: string;
  from: number;
  to: number;
};

export type HfmHiddenRange = {
  from: number;
  to: number;
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
