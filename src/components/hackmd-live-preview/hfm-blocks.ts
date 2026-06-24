import {
  StateField,
  type Range,
  type EditorState,
  type Extension,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';

import { treeGrowthEffect } from './tree-progress';

type ImageBlock = {
  alt: string;
  height?: number;
  lineTo: number;
  src: string;
  width?: number;
};

type FallbackBlock = {
  description: string;
  lineTo: number;
  title: string;
};

class ImagePreviewWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
    private readonly width?: number,
    private readonly height?: number,
  ) {
    super();
  }

  eq(other: ImagePreviewWidget): boolean {
    return other.src === this.src
      && other.alt === this.alt
      && other.width === this.width
      && other.height === this.height;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('figure');
    wrap.className = 'cm-hackmd-image-preview';
    wrap.setAttribute('contenteditable', 'false');

    const image = document.createElement('img');
    image.src = this.src;
    image.alt = this.alt;
    image.loading = 'lazy';

    if (this.width) {
      image.style.maxWidth = `${this.width}px`;
    }
    if (this.height) {
      image.style.maxHeight = `${this.height}px`;
    }

    wrap.appendChild(image);

    if (this.alt) {
      const caption = document.createElement('figcaption');
      caption.textContent = this.alt;
      wrap.appendChild(caption);
    }

    wrap.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const pos = view.posAtDOM(wrap);
      if (pos < 0) {
        return;
      }

      view.focus();
      view.dispatch({
        selection: { anchor: Math.max(0, pos - 1) },
        scrollIntoView: false,
      });
    });

    return wrap;
  }

  ignoreEvent(event: Event): boolean {
    return event.type === 'mousedown' || event.type === 'click';
  }
}

class HfmFallbackWidget extends WidgetType {
  constructor(
    private readonly title: string,
    private readonly description: string,
  ) {
    super();
  }

  eq(other: HfmFallbackWidget): boolean {
    return other.title === this.title && other.description === this.description;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-hackmd-fallback-block';
    wrap.setAttribute('contenteditable', 'false');

    const title = document.createElement('div');
    title.className = 'cm-hackmd-fallback-title';
    title.textContent = this.title;

    const description = document.createElement('div');
    description.className = 'cm-hackmd-fallback-description';
    description.textContent = this.description;

    wrap.append(title, description);
    return wrap;
  }
}

function parseMarkdownImage(lineText: string, lineTo: number): ImageBlock | null {
  const match = lineText.trim().match(/^!\[([^\]]*)\]\((\S+?)(?:\s+=([0-9]+)?x?([0-9]+)?)?(?:\s+["'][^)]*["'])?\)$/);
  if (!match) {
    return null;
  }

  const [, alt, src, width, height] = match;
  if (!src || /^(?:javascript|file|data|blob):/i.test(src)) {
    return null;
  }

  return {
    alt,
    src,
    lineTo,
    width: width ? Number.parseInt(width, 10) : undefined,
    height: height ? Number.parseInt(height, 10) : undefined,
  };
}

function getFenceFallback(lineText: string, lineTo: number): FallbackBlock | null {
  const match = lineText.match(/^(```|~~~)\s*([A-Za-z0-9_-]+)(.*)$/);
  if (!match) {
    return null;
  }

  const lang = match[2].toLowerCase();
  if (lang === 'csvpreview') {
    return {
      lineTo,
      title: 'CSV preview block',
      description: 'Recognized HackMD CSV preview syntax. Rendering stays in raw markdown for now.',
    };
  }

  if (['sequence', 'flow', 'graphviz', 'mermaid', 'abc', 'plantuml', 'vega', 'fretboard'].includes(lang)) {
    return {
      lineTo,
      title: `${lang} diagram block`,
      description: 'Recognized HackMD diagram syntax. The editor keeps it editable as source.',
    };
  }

  return null;
}

function getLineFallback(lineText: string, lineTo: number): FallbackBlock | null {
  const trimmed = lineText.trim();

  if (trimmed === '$$') {
    return {
      lineTo,
      title: 'MathJax block',
      description: 'Recognized HackMD block math. Rendering stays as editable LaTeX source.',
    };
  }

  const external = trimmed.match(/^\{%(youtube|vimeo|gist|slideshare|speakerdeck|pdf|figma)\s+(.+?)\s*%\}$/i);
  if (external) {
    return {
      lineTo,
      title: `${external[1].toLowerCase()} embed`,
      description: 'Recognized HackMD external embed syntax. It is not rendered inside the editor.',
    };
  }

  return null;
}

function buildHfmBlocks(state: EditorState): DecorationSet {
  const ranges: Array<Range<Decoration>> = [];

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const image = parseMarkdownImage(line.text, line.to);
    if (image) {
      ranges.push(Decoration.widget({
        block: true,
        side: 1,
        widget: new ImagePreviewWidget(image.src, image.alt, image.width, image.height),
      }).range(image.lineTo));
      continue;
    }

    const fallback = getFenceFallback(line.text, line.to) ?? getLineFallback(line.text, line.to);
    if (fallback) {
      ranges.push(Decoration.widget({
        block: true,
        side: 1,
        widget: new HfmFallbackWidget(fallback.title, fallback.description),
      }).range(fallback.lineTo));
    }
  }

  return Decoration.set(ranges, true);
}

const hfmBlocksField = StateField.define<DecorationSet>({
  create: (state) => buildHfmBlocks(state),
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(treeGrowthEffect)) {
        return buildHfmBlocks(transaction.state);
      }
    }

    if (!transaction.docChanged) {
      return decorations;
    }

    return buildHfmBlocks(transaction.state);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function hfmBlocks(): Extension {
  return hfmBlocksField;
}
