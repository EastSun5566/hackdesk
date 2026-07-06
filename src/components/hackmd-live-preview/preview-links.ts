import { syntaxTree } from '@codemirror/language';
import {
  Facet,
  type EditorState,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';

import { getActiveLines } from './hfm-decoration-ranges';

export type OpenLinkHandler = (url: string) => void;

export type OpenLinkRef = {
  current: OpenLinkHandler | undefined;
};

type MarkdownSyntaxNode = {
  from: number;
  name: string;
  parent: MarkdownSyntaxNode | null;
  to: number;
};

class LinkOpenWidget extends WidgetType {
  constructor(private readonly url: string) {
    super();
  }

  eq(other: LinkOpenWidget): boolean {
    return other.url === this.url;
  }

  toDOM(view: EditorView): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-hackmd-link-open';
    button.setAttribute('aria-label', 'Open link');
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const openLinkRef = view.state.facet(openLinkFacet);
      openLinkRef?.current?.(this.url);
    });
    return button;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

const openLinkFacet = Facet.define<OpenLinkRef, OpenLinkRef | null>({
  combine: (values) => values.at(-1) ?? null,
});

export function hackmdLinkOpenAffordance(onOpenLinkRef: OpenLinkRef): Extension {
  return [
    openLinkFacet.of(onOpenLinkRef),
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
          this.decorations = buildLinkOpenDecorations(view.state);
        }

        update(update: ViewUpdate) {
          if (update.docChanged || update.selectionSet || update.viewportChanged) {
            this.decorations = buildLinkOpenDecorations(update.state);
          }
        }
      },
      {
        decorations: (plugin) => plugin.decorations,
      },
    ),
  ];
}

export function getSafeExternalLink(rawUrl: string): string | null {
  const trimmed = rawUrl.trim().replace(/^<|>$/g, '');
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function findClosestElement(target: EventTarget | null, selector: string): HTMLElement | null {
  if (target instanceof Element) {
    return target.closest<HTMLElement>(selector);
  }
  if (target instanceof Node) {
    return target.parentElement?.closest<HTMLElement>(selector) ?? null;
  }
  return null;
}

function hasParentNamed(node: MarkdownSyntaxNode, name: string): boolean {
  let parent = node.parent;
  while (parent) {
    if (parent.name === name) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

function extractLinkUrl(state: EditorState, linkRange: { from: number; name?: string; to: number }): string {
  if (linkRange.name === 'URL') {
    return state.sliceDoc(linkRange.from, linkRange.to);
  }

  let url = '';

  syntaxTree(state).iterate({
    from: linkRange.from,
    to: linkRange.to,
    enter(node) {
      if (node.name !== 'URL') {
        return;
      }

      url = state.sliceDoc(node.from, node.to);
      return false;
    },
  });

  if (url) {
    return url;
  }

  const source = state.sliceDoc(linkRange.from, linkRange.to);
  return source.match(/\]\(([^)\s]+)(?:\s+["'][^)]+["'])?\)/)?.[1] ?? '';
}

function buildLinkOpenDecorations(state: EditorState): DecorationSet {
  const ranges: Array<Range<Decoration>> = [];
  const activeLines = getActiveLines(state);

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Link' && node.name !== 'URL') {
        return;
      }

      if (node.name === 'URL' && (hasParentNamed(node.node as MarkdownSyntaxNode, 'Link') || hasParentNamed(node.node as MarkdownSyntaxNode, 'Image'))) {
        return;
      }

      if (!isInactiveSingleLineRange(state, activeLines, node.from, node.to)) {
        return;
      }

      const url = getSafeExternalLink(extractLinkUrl(state, {
        from: node.from,
        name: node.name,
        to: node.to,
      }));
      if (!url) {
        return;
      }

      ranges.push(Decoration.widget({
        side: 1,
        widget: new LinkOpenWidget(url),
      }).range(node.to));
    },
  });

  return Decoration.set(ranges, true);
}

function isInactiveSingleLineRange(
  state: EditorState,
  activeLines: Set<number>,
  from: number,
  to: number,
): boolean {
  const startLine = state.doc.lineAt(from);
  const endLine = state.doc.lineAt(Math.max(from, to - 1));
  return startLine.number === endLine.number && !activeLines.has(startLine.number);
}
