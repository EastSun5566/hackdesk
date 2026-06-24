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
    color: 'var(--code-comment, #6a7a82)',
    fontStyle: 'italic',
  },
  {
    tag: [
      tags.keyword,
      tags.modifier,
      tags.operatorKeyword,
      tags.controlKeyword,
      tags.definitionKeyword,
      tags.moduleKeyword,
      tags.self,
    ],
    color: 'var(--code-keyword, #c792ea)',
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.character],
    color: 'var(--code-string, #c3e88d)',
  },
  {
    tag: [tags.number, tags.integer, tags.float, tags.bool, tags.null, tags.atom],
    color: 'var(--code-number, #f78c6c)',
  },
  {
    tag: [tags.typeName, tags.className, tags.namespace, tags.standard(tags.variableName)],
    color: 'var(--code-type, #ffcb6b)',
  },
  {
    tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.macroName],
    color: 'var(--code-function, #82aaff)',
  },
  {
    tag: [tags.propertyName, tags.attributeName, tags.definition(tags.propertyName)],
    color: 'var(--code-property, #82aaff)',
  },
  {
    tag: [tags.regexp, tags.tagName, tags.angleBracket],
    color: 'var(--code-regexp, #f07178)',
  },
  {
    tag: tags.escape,
    color: 'var(--code-escape, #89ddff)',
  },
  {
    tag: [tags.operator, tags.punctuation, tags.bracket, tags.squareBracket, tags.paren, tags.brace],
    color: 'var(--code-operator, #89ddff)',
  },
  {
    tag: [tags.variableName, tags.labelName, tags.definition(tags.variableName), tags.local(tags.variableName)],
    color: 'var(--code-variable, #eeffff)',
  },
  {
    tag: tags.invalid,
    color: 'var(--code-invalid, #ff5370)',
  },
]);
