import DOMPurify from 'dompurify';
import katex from 'katex';
import MarkdownIt, { type StateBlock, type StateInline } from 'markdown-it';

import type { Slide, SlideDeck } from '@/lib/slides';

// `.slide:` and `.element:` comments may set only these attributes.
const COMMENT_ATTRIBUTE = /^(?:data-[\w-]+|id|class|style)$/i;
// reveal.js would load these in a frame inside the presentation window.
const FORBIDDEN_ATTRIBUTES = ['data-background-iframe', 'data-preview-link'];

/** Renders a deck as reveal.js `<section>`s: one per slide, nested for vertical slides. */
export function renderSlides(deck: Pick<SlideDeck, 'stacks' | 'breaks'>): HTMLElement[] {
  const markdown = createMarkdown(deck.breaks);
  const purify = createPurify();
  const render = (slide: Slide) => renderSlide(slide, markdown, purify);

  return deck.stacks.map((stack) => {
    if (stack.length === 1) return render(stack[0]!);
    const section = document.createElement('section');
    section.append(...stack.map(render));
    return section;
  });
}

function renderSlide(slide: Slide, markdown: Markdown, purify: typeof DOMPurify): HTMLElement {
  const template = document.createElement('template');
  template.innerHTML = `<section>${markdown.render(slide.content)}</section>`;
  const section = template.content.firstElementChild as HTMLElement;
  applyCommentAttributes(section);
  if (slide.notes) {
    const notes = document.createElement('aside');
    notes.className = 'notes';
    notes.innerHTML = markdown.render(slide.notes);
    section.append(notes);
  }

  const fragment = purify.sanitize(section.outerHTML, {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    FORBID_ATTR: FORBIDDEN_ATTRIBUTES,
    RETURN_DOM_FRAGMENT: true,
  });
  return fragment.firstElementChild as HTMLElement;
}

/**
 * `<!-- .slide: data-background="#000" -->` sets attributes on the slide, and
 * `<!-- .element: class="fragment" -->` on the element before it (or its parent, after text).
 */
function applyCommentAttributes(section: HTMLElement) {
  const walker = document.createTreeWalker(section, NodeFilter.SHOW_COMMENT);
  const comments: Comment[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode as Comment);

  for (const comment of comments) {
    const text = comment.data.trim();
    const target = text.startsWith('.slide:') ? section
      : text.startsWith('.element') ? elementBefore(comment)
        : null;
    if (!target) continue;
    for (const [, name, value] of text.matchAll(/([^\s"=]+)="([^"]*)"/g)) {
      if (!COMMENT_ATTRIBUTE.test(name!)) continue;
      if (name!.toLowerCase() === 'class') target.classList.add(...value!.split(/\s+/).filter(Boolean));
      else target.setAttribute(name!, value!);
    }
    comment.remove();
  }
}

function elementBefore(comment: Comment) {
  for (let node = comment.previousSibling; node; node = node.previousSibling) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.trim()) break;
    } else if (node instanceof Element && node.tagName !== 'BR') {
      return node;
    }
  }
  return comment.parentElement;
}

function createPurify() {
  const purify = DOMPurify(window);
  // Links open in the browser, never inside the presentation.
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && /^https?:/i.test(node.getAttribute('href') ?? '')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return purify;
}

type Markdown = ReturnType<typeof createMarkdown>;

function createMarkdown(breaks: boolean) {
  const markdown = new MarkdownIt({ html: true, linkify: true, breaks });
  markdown.inline.ruler.after('escape', 'math_inline', inlineMath);
  markdown.block.ruler.after('blockquote', 'math_block', blockMath, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  markdown.renderer.rules.math_inline = (tokens, index) => renderMath(tokens[index]!.content, tokens[index]!.markup === '$$');
  markdown.renderer.rules.math_block = (tokens, index) => `${renderMath(tokens[index]!.content, true)}\n`;
  markdown.renderer.rules.fence = (tokens, index) => renderFence(tokens[index]!.info, tokens[index]!.content, markdown);
  return markdown;
}

const renderMath = (source: string, displayMode: boolean) => katex.renderToString(source, { displayMode, throwOnError: false, trust: false });

/**
 * Code goes to reveal.js's highlighter. `js=` numbers the lines, `js=10` from 10, and
 * `[1,3-4|6]` highlights those lines, one step at a time.
 */
function renderFence(info: string, code: string, markdown: Markdown) {
  const [, language = '', numbered, start, lines] = /^([^\s=[]*)(=(\d+)?\+?)?\s*(?:\[([^\]]*)\])?/.exec(info.trim()) ?? [];
  const attributes = [
    language ? ` class="language-${markdown.utils.escapeHtml(language)}"` : '',
    numbered || lines ? ` data-line-numbers="${markdown.utils.escapeHtml(lines ?? '')}"` : '',
    start ? ` data-ln-start-from="${start}"` : '',
  ].join('');
  return `<pre><code${attributes}>${markdown.utils.escapeHtml(code)}</code></pre>\n`;
}

/** `$x$` inline, or `$$x$$` inline in display style. */
function inlineMath(state: StateInline, silent: boolean) {
  if (state.src[state.pos] !== '$') return false;
  const marker = state.src.startsWith('$$', state.pos) ? '$$' : '$';
  const from = state.pos + marker.length;
  let end = state.src.indexOf(marker, from);
  while (end > 0 && state.src[end - 1] === '\\') end = state.src.indexOf(marker, end + 1);
  if (end <= from) return false;

  const source = state.src.slice(from, end);
  // Like "$5 and $10", a `$` next to a space or before a digit is a price, not math.
  if (marker === '$' && (/^\s|\s$/.test(source) || /\d/.test(state.src[end + 1] ?? ''))) return false;
  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.content = source;
    token.markup = marker;
  }
  state.pos = end + marker.length;
  return true;
}

/** A `$$` block, on one line or from a line starting with `$$` to one ending with it. */
function blockMath(state: StateBlock, startLine: number, endLine: number, silent: boolean) {
  const lineAt = (line: number) => state.src.slice(state.bMarks[line]! + state.tShift[line]!, state.eMarks[line]).trimEnd();
  if (state.sCount[startLine]! - state.blkIndent >= 4) return false;
  const first = lineAt(startLine);
  if (!first.startsWith('$$')) return false;

  let last = startLine;
  let source: string;
  if (first.length >= 4 && first.endsWith('$$')) {
    source = first.slice(2, -2);
  } else {
    do last += 1; while (last < endLine && !lineAt(last).endsWith('$$'));
    if (last >= endLine) return false;
    const middle = Array.from({ length: last - startLine - 1 }, (_, offset) => lineAt(startLine + 1 + offset));
    source = [first.slice(2), ...middle, lineAt(last).slice(0, -2)].join('\n');
  }
  if (silent) return true;

  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.content = source.trim();
  token.map = [startLine, last + 1];
  state.line = last + 1;
  return true;
}
