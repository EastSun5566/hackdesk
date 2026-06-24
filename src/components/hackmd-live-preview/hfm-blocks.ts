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

import {
  getFenceFallback,
  getLineFallback,
  parseMarkdownImage,
} from './hfm-recognizers';
import { treeGrowthEffect } from './tree-progress';

class ImagePreviewWidget extends WidgetType {
  constructor(
    private readonly src: string,
    private readonly alt: string,
    private readonly lineTo: number,
    private readonly width?: number,
    private readonly height?: number,
  ) {
    super();
  }

  eq(other: ImagePreviewWidget): boolean {
    return other.src === this.src
      && other.alt === this.alt
      && other.lineTo === this.lineTo
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

      view.focus();
      view.dispatch({
        selection: { anchor: this.lineTo },
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
    private readonly lineTo: number,
  ) {
    super();
  }

  eq(other: HfmFallbackWidget): boolean {
    return other.title === this.title
      && other.description === this.description
      && other.lineTo === this.lineTo;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-hackmd-fallback-block';
    wrap.setAttribute('contenteditable', 'false');
    wrap.setAttribute('role', 'button');
    wrap.tabIndex = 0;

    const title = document.createElement('div');
    title.className = 'cm-hackmd-fallback-title';
    title.textContent = this.title;

    const description = document.createElement('div');
    description.className = 'cm-hackmd-fallback-description';
    description.textContent = this.description;

    wrap.append(title, description);
    const focusSource = () => {
      view.focus();
      view.dispatch({
        selection: { anchor: this.lineTo },
        scrollIntoView: false,
      });
    };

    wrap.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      focusSource();
    });
    wrap.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      focusSource();
    });

    return wrap;
  }

  ignoreEvent(event: Event): boolean {
    return event.type === 'mousedown' || event.type === 'click' || event.type === 'keydown';
  }
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
        widget: new ImagePreviewWidget(image.src, image.alt, image.lineTo, image.width, image.height),
      }).range(image.lineTo));
      continue;
    }

    const fallback = getFenceFallback(line.text, line.to) ?? getLineFallback(line.text, line.to);
    if (fallback) {
      ranges.push(Decoration.widget({
        block: true,
        side: 1,
        widget: new HfmFallbackWidget(fallback.title, fallback.description, fallback.lineTo),
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
