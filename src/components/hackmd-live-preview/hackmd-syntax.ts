import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const hackmdMarkdownHighlightStyle = HighlightStyle.define([
  {
    tag: tags.heading,
    color: 'var(--text-default)',
    fontWeight: '700',
  },
  {
    tag: tags.heading1,
    fontSize: '1.22em',
  },
  {
    tag: tags.heading2,
    fontSize: '1.12em',
  },
  {
    tag: tags.heading3,
    fontSize: '1.05em',
  },
  {
    tag: tags.strong,
    color: 'var(--text-default)',
    fontWeight: '700',
  },
  {
    tag: tags.emphasis,
    color: 'var(--text-default)',
    fontStyle: 'italic',
  },
  {
    tag: tags.strikethrough,
    textDecoration: 'line-through',
    textDecorationColor: 'var(--text-subtle)',
  },
  {
    tag: [tags.link, tags.url],
    color: 'var(--link-text-default)',
    textDecoration: 'underline',
    textDecorationColor: 'color-mix(in oklch, var(--link-text-default) 48%, transparent)',
  },
  {
    tag: tags.quote,
    color: 'var(--text-subtle)',
    fontStyle: 'italic',
  },
  {
    tag: tags.monospace,
    color: 'var(--primary-default)',
    backgroundColor: 'var(--primary-soft)',
  },
  {
    tag: tags.contentSeparator,
    color: 'var(--border-default)',
  },
  {
    tag: tags.list,
    color: 'var(--text-subtle)',
  },
  {
    tag: tags.meta,
    color: 'var(--text-subtle)',
  },
  {
    tag: tags.comment,
    color: 'var(--text-subtle)',
    fontStyle: 'italic',
  },
  {
    tag: [tags.keyword, tags.atom, tags.bool],
    color: 'var(--primary-default)',
  },
  {
    tag: [tags.string, tags.number],
    color: 'var(--success-default)',
  },
  {
    tag: [tags.variableName, tags.definition(tags.variableName), tags.propertyName],
    color: 'var(--text-default)',
  },
  {
    tag: tags.invalid,
    color: 'var(--destructive-default)',
  },
]);
