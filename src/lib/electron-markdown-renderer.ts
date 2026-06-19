import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import http from 'highlight.js/lib/languages/http';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import scss from 'highlight.js/lib/languages/scss';
import shell from 'highlight.js/lib/languages/shell';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import MarkdownIt from 'markdown-it';
import markdownItAbbr from 'markdown-it-abbr';
import markdownItAnchor from 'markdown-it-anchor';
import markdownItContainer from 'markdown-it-container';
import markdownItDeflist from 'markdown-it-deflist';
import { full as markdownItEmoji } from 'markdown-it-emoji';
import markdownItFootnote from 'markdown-it-footnote';
import markdownItHtml5Embed from 'markdown-it-html5-embed';
import markdownItImageFigures from 'markdown-it-image-figures';
import markdownItIns from 'markdown-it-ins';
import markdownItMark from 'markdown-it-mark';
import markdownItRuby from 'markdown-it-ruby';
import markdownItSub from 'markdown-it-sub';
import markdownItSup from 'markdown-it-sup';
import markdownItTaskLists from 'markdown-it-task-lists';
import markdownItToc from 'markdown-it-toc-done-right';

type HighlightRange = number | [number, number];

const highlightLanguages = [
  ['javascript', javascript],
  ['js', javascript],
  ['typescript', typescript],
  ['ts', typescript],
  ['json', json],
  ['java', java],
  ['markdown', markdown],
  ['md', markdown],
  ['shell', shell],
  ['powershell', powershell],
  ['css', css],
  ['scss', scss],
  ['yaml', yaml],
  ['python', python],
  ['http', http],
  ['go', go],
  ['ruby', ruby],
  ['bash', bash],
  ['xml', xml],
] as const;

const blockedMarkdownUrlSchemePattern = /^(?:javascript|data|blob|file):/i;

highlightLanguages.forEach(([name, language]) => {
  hljs.registerLanguage(name, language);
});

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseFrontmatterValue(value: string): unknown {
  const trimmed = value.trim();

  if (!trimmed) {
    return '';
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1);
  }

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  if (trimmed === 'null') {
    return null;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((item) => parseFrontmatterValue(item));
  }

  return trimmed;
}

function parseFrontmatter(source: string) {
  const normalized = source.replace(/\r\n/g, '\n');

  if (!normalized.startsWith('---\n')) {
    return {
      content: source,
      data: {},
    };
  }

  const lines = normalized.split('\n');
  const closeIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');

  if (closeIndex === -1) {
    return {
      content: source,
      data: {},
    };
  }

  const data: Record<string, unknown> = {};
  const frontmatterLines = lines.slice(1, closeIndex);

  frontmatterLines.forEach((line) => {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) {
      return;
    }

    data[match[1]] = parseFrontmatterValue(match[2]);
  });

  return {
    content: lines.slice(closeIndex + 1).join('\n'),
    data,
  };
}

function processLang(lang = '') {
  const matchNumber = lang.match(/(.+)=/);
  return matchNumber?.[1] ?? lang;
}

function parseHighlightedRanges(langAttrs = ''): HighlightRange[] {
  const match = langAttrs.match(/\[([\d-,\s]+)\]/);
  if (!match) {
    return [];
  }

  return match[1]
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map<HighlightRange | null>((segment) => {
      if (!segment.includes('-')) {
        const lineNumber = Number.parseInt(segment, 10);
        return Number.isFinite(lineNumber) ? lineNumber : null;
      }

      const [start, end] = segment
        .split('-')
        .map((value) => Number.parseInt(value.trim(), 10));

      return Number.isFinite(start) && Number.isFinite(end) ? [start, end] : null;
    })
    .filter((range): range is HighlightRange => range !== null);
}

function isHighlighted(lineNumber: number, lines: HighlightRange[]) {
  return lines.some((line) => {
    if (Array.isArray(line)) {
      return line[0] <= lineNumber && lineNumber <= line[1];
    }

    return lineNumber === line;
  });
}

function safeLanguageClass(lang: string) {
  return lang.replace(/[^a-z0-9_-]/gi, '').toLowerCase();
}

function stripUnsafeMarkdownUrls(source: string) {
  return source.replace(
    /(!?)\[([^\]\n]*)\]\((\s*<?[^)\s>]+>?\s*)([^)]*)\)/g,
    (match, marker: string, label: string, destination: string) => {
      const normalizedDestination = destination.trim().replace(/^<|>$/g, '');

      if (!blockedMarkdownUrlSchemePattern.test(normalizedDestination)) {
        return match;
      }

      return label;
    },
  );
}

function parseImageSize(source: string, pos: number, max: number) {
  if (source.charCodeAt(pos) !== 0x3d) {
    return null;
  }

  let cursor = pos + 1;
  let width = '';
  let height = '';

  while (cursor < max) {
    const code = source.charCodeAt(cursor);
    if (code < 0x30 || code > 0x39) {
      break;
    }

    width += source[cursor];
    cursor += 1;
  }

  if (source.charCodeAt(cursor) !== 0x78) {
    return null;
  }

  cursor += 1;

  while (cursor < max) {
    const code = source.charCodeAt(cursor);
    if (code < 0x30 || code > 0x39) {
      break;
    }

    height += source[cursor];
    cursor += 1;
  }

  if (!width && !height) {
    return null;
  }

  return { width, height, pos: cursor };
}

function imageSizePlugin(md: MarkdownIt) {
  const imageWithSize: MarkdownIt.ParserInline.RuleInline = (state, silent) => {
    let title = '';
    let width = '';
    let height = '';
    let href = '';
    const oldPos = state.pos;
    const max = state.posMax;

    if (state.src.charCodeAt(state.pos) !== 0x21) {
      return false;
    }

    if (state.src.charCodeAt(state.pos + 1) !== 0x5b) {
      return false;
    }

    const labelStart = state.pos + 2;
    const labelEnd = md.helpers.parseLinkLabel(state, state.pos + 1, false);

    if (labelEnd < 0) {
      return false;
    }

    const label = state.src.slice(labelStart, labelEnd);
    let pos = labelEnd + 1;

    if (pos < max && state.src.charCodeAt(pos) === 0x28) {
      pos += 1;

      while (pos < max) {
        const code = state.src.charCodeAt(pos);
        if (code !== 0x20 && code !== 0x0a) {
          break;
        }

        pos += 1;
      }

      const destination = md.helpers.parseLinkDestination(state.src, pos, max);
      if (destination.ok) {
        href = state.md.normalizeLink(destination.str);
        if (!state.md.validateLink(href)) {
          href = '';
        }

        pos = destination.pos;
      }

      let start = pos;
      while (pos < max) {
        const code = state.src.charCodeAt(pos);
        if (code !== 0x20 && code !== 0x0a) {
          break;
        }

        pos += 1;
      }

      const titleParse = md.helpers.parseLinkTitle(state.src, pos, max);
      if (pos < max && start !== pos && titleParse.ok) {
        title = titleParse.str;
        pos = titleParse.pos;

        while (pos < max) {
          const code = state.src.charCodeAt(pos);
          if (code !== 0x20 && code !== 0x0a) {
            break;
          }

          pos += 1;
        }
      }

      start = pos;
      const size = parseImageSize(state.src, pos, max);
      if (pos < max && start !== oldPos && size) {
        width = size.width;
        height = size.height;
        pos = size.pos;

        while (pos < max) {
          const code = state.src.charCodeAt(pos);
          if (code !== 0x20 && code !== 0x0a) {
            break;
          }

          pos += 1;
        }
      }

      if (pos >= max || state.src.charCodeAt(pos) !== 0x29) {
        state.pos = oldPos;
        return false;
      }

      pos += 1;
    } else {
      state.pos = oldPos;
      return false;
    }

    if (!href) {
      state.pos = oldPos;
      return false;
    }

    if (!silent) {
      state.pos = labelStart;
      state.posMax = labelEnd;

      const tokens: MarkdownIt.Token[] = [];
      const nestedState = new state.md.inline.State(
        state.src.slice(labelStart, labelEnd),
        state.md,
        state.env,
        tokens,
      );
      nestedState.md.inline.tokenize(nestedState);

      const token = state.push('image', 'img', 0);
      token.attrs = [
        ['src', href],
        ['alt', ''],
      ];
      token.children = tokens;
      token.content = label;

      if (title) {
        token.attrSet('title', title);
      }

      if (width) {
        token.attrSet('width', width);
      }

      if (height) {
        token.attrSet('height', height);
      }
    }

    state.pos = pos;
    state.posMax = max;
    return true;
  };

  md.inline.ruler.before('emphasis', 'image_with_size', imageWithSize);
}

function wrapCodeLines(html: string, lang = '', langAttrs = '') {
  const showLineNumber = /\w+=/.test(lang);
  const lineOffsetMatch = lang.match(/\w+=(\d+)/);
  const lineOffset = lineOffsetMatch
    ? Math.abs(Number.parseInt(lineOffsetMatch[1], 10)) - 1
    : 0;
  const highlightedLines = parseHighlightedRanges(langAttrs);
  const lines = html.endsWith('\n') ? html.slice(0, -1).split('\n') : html.split('\n');

  const codeRows = lines
    .map((line, index) => {
      const lineNumber = index + 1 + lineOffset;
      const highlighted = isHighlighted(lineNumber, highlightedLines) ? ' highlighted' : '';

      return [
        '<tr>',
        `<td class="hljs-line-number" data-line-number="${lineNumber}"></td>`,
        `<td class="hljs-line${highlighted}" id="LC${lineNumber}">${line || '\u200b'}</td>`,
        '</tr>',
      ].join('');
    })
    .join('');

  const lineNumberClass = showLineNumber ? ' has-line-number' : '';
  const highlightedLang = safeLanguageClass(processLang(lang));
  const languageClass = highlightedLang ? ` language-${highlightedLang}` : '';

  return `<pre class="hackdesk-code-block"><table class="fence-wrapper${lineNumberClass}${languageClass}"><tbody>${codeRows}</tbody></table></pre>`;
}

function createMarkdownIt() {
  const md = new MarkdownIt('default', {
    html: true,
    linkify: true,
    typographer: true,
    highlight(code: string, lang = '', langAttrs = '') {
      const highlightedLang = processLang(lang);

      if (highlightedLang && hljs.getLanguage(highlightedLang)) {
        try {
          const highlightedCode = hljs.highlight(code, {
            language: highlightedLang,
            ignoreIllegals: true,
          }).value;

          return wrapCodeLines(highlightedCode, lang, langAttrs);
        } catch {
          return wrapCodeLines(escapeHtml(code), lang, langAttrs);
        }
      }

      return wrapCodeLines(escapeHtml(code), lang, langAttrs);
    },
  });

  md.use(markdownItAbbr)
    .use(markdownItDeflist)
    .use(markdownItMark)
    .use(markdownItIns)
    .use(markdownItSub)
    .use(markdownItSup)
    .use(markdownItFootnote)
    .use(imageSizePlugin)
    .use(markdownItImageFigures, {
      dataType: true,
      figcaption: true,
    })
    .use(markdownItAnchor, {
      permalink: markdownItAnchor.permalink.linkInsideHeader({
        class: 'anchor',
        symbol: '#',
        placement: 'before',
      }),
    })
    .use(markdownItToc)
    .use(markdownItContainer, 'success', { render: containerRenderer })
    .use(markdownItContainer, 'info', { render: containerRenderer })
    .use(markdownItContainer, 'warning', { render: containerRenderer })
    .use(markdownItContainer, 'danger', { render: containerRenderer })
    .use(markdownItContainer, 'spoiler', {
      validate(params: string) {
        return Boolean(params.trim().match(/^spoiler(\s+.*)?$/));
      },
      render(tokens: MarkdownIt.Token[], idx: number) {
        const match = tokens[idx].info.trim().match(/^spoiler(\s+.*)?$/);

        if (tokens[idx].nesting === 1) {
          const summary = match?.[1]?.trim();
          return summary ? `<details><summary>${md.renderInline(summary)}</summary>\n` : '<details>\n';
        }

        return '</details>\n';
      },
    })
    .use(markdownItRuby)
    .use(markdownItEmoji)
    .use(markdownItTaskLists)
    .use(markdownItHtml5Embed, {
      html5embed: {
        useImageSyntax: true,
      },
    })
    .use(calloutPlugin);

  return md;
}

const containerClassNamesMap = {
  info: 'flash',
  success: 'flash flash-success',
  warning: 'flash flash-warn',
  danger: 'flash flash-error',
} as const;

function containerRenderer(
  tokens: MarkdownIt.Token[],
  idx: number,
  options: MarkdownIt.Options,
  env: unknown,
  self: MarkdownIt.Renderer,
) {
  const token = tokens[idx];
  const type = token.info.trim() as keyof typeof containerClassNamesMap;
  const className = containerClassNamesMap[type] ?? containerClassNamesMap.info;

  token.attrJoin('class', `container-block ${className}`);

  return self.renderToken(tokens, idx, options);
}

function isSpace(code: number) {
  return code === 0x20 || code === 0x09;
}

const calloutToClassMap = {
  note: 'info',
  tip: 'success',
  warning: 'warning',
  danger: 'danger',
} as const;

const calloutToIconMap = {
  note: 'info',
  tip: 'tip',
  warning: 'warning',
  danger: 'danger',
  todo: 'todo',
} as const;

const renderCalloutOpen: MarkdownIt.Renderer.RenderRule = (tokens, idx) => {
  const token = tokens[idx];
  const info = token.info.trim().toLowerCase();
  const className =
    calloutToClassMap[info as keyof typeof calloutToClassMap] ?? 'info';
  const icon =
    calloutToIconMap[info as keyof typeof calloutToIconMap] ?? 'info';

  return (
    `<div class="callout callout-${className}" data-label="${escapeHtml(info)}">`
    + `<span class="callout-icon" data-icon="${icon}"></span>`
  );
};

const renderCalloutClose: MarkdownIt.Renderer.RenderRule = () => '</div>';

function calloutPlugin(md: MarkdownIt) {
  const calloutRule: MarkdownIt.ParserBlock.RuleBlock = (state, startLine, endLine, silent) => {
    let adjustTab = false;
    let ch = 0;
    let initial = 0;
    let lastLineEmpty = false;
    let nextLine = startLine;
    let offset = 0;
    let oldIndent = state.blkIndent;
    const oldParentType = state.parentType;
    let spaceAfterMarker = false;
    let terminate = false;
    let isOutdented = false;
    const oldLineMax = state.lineMax;
    const oldBMarks: number[] = [];
    const oldBSCount: number[] = [];
    const oldSCount: number[] = [];
    const oldTShift: number[] = [];
    const terminatorRules = state.md.block.ruler.getRules('blockquote');
    let hasCallout = false;
    let calloutMarkerLength = 0;

    let pos = state.bMarks[startLine] + state.tShift[startLine];
    let max = state.eMarks[startLine];

    if (state.sCount[startLine] - state.blkIndent >= 4) {
      return false;
    }

    if (state.src.charCodeAt(pos) !== 0x3e) {
      return false;
    }

    pos += 1;

    if (
      state.src.charCodeAt(pos) === 0x20
      && state.src.charCodeAt(pos + 1) === 0x5b
      && state.src.charCodeAt(pos + 2) === 0x21
    ) {
      const startPos = pos + 3;
      pos = startPos;

      while (pos < max && state.src.charCodeAt(pos) !== 0x5d) {
        pos += 1;
      }

      if (state.src.charCodeAt(pos) === 0x5d) {
        hasCallout = true;
        calloutMarkerLength = pos - startPos;

        if (!silent) {
          const token = state.push('callout_open', 'callout', 1);
          token.markup = '> [!';
          token.info = state.src.slice(startPos, pos).trim().toLowerCase();
        }
      }
    }

    if (silent) {
      return true;
    }

    state.parentType = 'blockquote';

    for (nextLine = startLine; nextLine < endLine; nextLine += 1) {
      isOutdented = state.sCount[nextLine] < state.blkIndent;
      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];

      if (pos >= max) {
        break;
      }

      if (state.src.charCodeAt(pos) === 0x3e && !isOutdented) {
        pos += 1;
        initial = state.sCount[nextLine] + 1;

        if (state.src.charCodeAt(pos) === 0x20) {
          pos += 1;
          initial += 1;
          adjustTab = false;
          spaceAfterMarker = true;
        } else if (state.src.charCodeAt(pos) === 0x09) {
          spaceAfterMarker = true;

          if ((state.bsCount[nextLine] + initial) % 4 === 3) {
            pos += 1;
            initial += 1;
            adjustTab = false;
          } else {
            adjustTab = true;
          }
        } else {
          spaceAfterMarker = false;
        }

        offset = initial;
        oldBMarks.push(state.bMarks[nextLine]);
        state.bMarks[nextLine] = pos;

        while (pos < max) {
          ch = state.src.charCodeAt(pos);

          if (!isSpace(ch)) {
            break;
          }

          if (ch === 0x09) {
            offset += 4 - ((offset + state.bsCount[nextLine] + (adjustTab ? 1 : 0)) % 4);
          } else {
            offset += 1;
          }

          pos += 1;
        }

        lastLineEmpty = pos >= max;

        oldBSCount.push(state.bsCount[nextLine]);
        state.bsCount[nextLine] = state.sCount[nextLine] + 1 + (spaceAfterMarker ? 1 : 0);

        oldSCount.push(state.sCount[nextLine]);
        state.sCount[nextLine] = offset - initial;

        oldTShift.push(state.tShift[nextLine]);
        state.tShift[nextLine] = pos - state.bMarks[nextLine];
        continue;
      }

      if (lastLineEmpty) {
        break;
      }

      terminate = false;

      for (const rule of terminatorRules) {
        if (rule(state, nextLine, endLine, true)) {
          terminate = true;
          break;
        }
      }

      if (terminate) {
        state.lineMax = nextLine;

        if (state.blkIndent !== 0) {
          oldBMarks.push(state.bMarks[nextLine]);
          oldBSCount.push(state.bsCount[nextLine]);
          oldTShift.push(state.tShift[nextLine]);
          oldSCount.push(state.sCount[nextLine]);
          state.sCount[nextLine] -= state.blkIndent;
        }

        break;
      }

      oldBMarks.push(state.bMarks[nextLine]);
      oldBSCount.push(state.bsCount[nextLine]);
      oldTShift.push(state.tShift[nextLine]);
      oldSCount.push(state.sCount[nextLine]);
      state.sCount[nextLine] = -1;
    }

    oldIndent = state.blkIndent;
    state.blkIndent = 0;

    const lines: [number, number] = [startLine, 0];
    let token = state.push('blockquote_open', 'blockquote', 1);
    token.markup = '>';
    token.map = lines;

    if (hasCallout) {
      state.bMarks[startLine] += calloutMarkerLength + 3;
    }

    state.md.block.tokenize(state, startLine, nextLine);

    token = state.push('blockquote_close', 'blockquote', -1);
    token.markup = '>';

    if (hasCallout) {
      token = state.push('callout_close', 'callout', -1);
      token.markup = ']';
    }

    state.lineMax = oldLineMax;
    state.parentType = oldParentType;
    lines[1] = state.line;

    for (let index = 0; index < oldTShift.length; index += 1) {
      state.bMarks[index + startLine] = oldBMarks[index];
      state.tShift[index + startLine] = oldTShift[index];
      state.sCount[index + startLine] = oldSCount[index];
      state.bsCount[index + startLine] = oldBSCount[index];
    }

    state.blkIndent = oldIndent;

    return true;
  };

  md.block.ruler.at('blockquote', calloutRule);
  md.renderer.rules.callout_open = renderCalloutOpen;
  md.renderer.rules.callout_close = renderCalloutClose;
}

const md = createMarkdownIt();

export type RenderedHackmdMarkdown = {
  html: string;
  data: Record<string, unknown>;
  content: string;
};

export function renderHackmdMarkdown(source = ''): RenderedHackmdMarkdown {
  const { content, data } = parseFrontmatter(source);
  const safeContent = stripUnsafeMarkdownUrls(content);
  const rawHtml = md.render(safeContent);
  const html = DOMPurify.sanitize(rawHtml, {
    ADD_ATTR: ['data-label', 'data-icon', 'data-line-number'],
    ALLOW_DATA_ATTR: false,
  });

  return {
    html,
    data,
    content: safeContent,
  };
}
