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

import { getHfmDocumentIndex, hfmDocumentIndexExtension } from './hfm-document-index';
import { treeGrowthEffect } from './tree-progress';

const imageDimensionCache = new Map<string, { height: number; width: number }>();
const MAX_IMAGE_CACHE_ENTRIES = 128;
const fallbackImagePreviewHeight = 260;

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

  get estimatedHeight(): number {
    if (this.height) {
      return this.height + 48;
    }

    const cached = imageDimensionCache.get(this.src);
    if (cached) {
      return Math.min(Math.max(cached.height, 96), 520) + 48;
    }

    return fallbackImagePreviewHeight;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('figure');
    wrap.className = 'cm-hackmd-image-preview';
    wrap.setAttribute('contenteditable', 'false');

    const image = document.createElement('img');
    image.src = this.src;
    image.alt = this.alt;
    image.loading = 'lazy';

    const cached = imageDimensionCache.get(this.src);
    const stableWidth = this.width ?? cached?.width;
    const stableHeight = this.height ?? cached?.height;
    if (stableWidth && stableHeight) {
      image.width = stableWidth;
      image.height = stableHeight;
    }

    if (this.width) {
      image.style.maxWidth = `${this.width}px`;
    }
    if (this.height) {
      image.style.maxHeight = `${this.height}px`;
    }

    image.addEventListener('load', () => {
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        return;
      }

      imageDimensionCache.delete(this.src);
      imageDimensionCache.set(this.src, {
        height: image.naturalHeight,
        width: image.naturalWidth,
      });
      while (imageDimensionCache.size > MAX_IMAGE_CACHE_ENTRIES) {
        imageDimensionCache.delete(imageDimensionCache.keys().next().value!);
      }
      view.requestMeasure();
    });

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

function buildHfmBlocks(state: EditorState): DecorationSet {
  const ranges: Array<Range<Decoration>> = [];

  for (const image of getHfmDocumentIndex(state).images) {
    ranges.push(Decoration.widget({
      block: true,
      side: 1,
      widget: new ImagePreviewWidget(image.src, image.alt, image.lineTo, image.width, image.height),
    }).range(image.lineTo));
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
  return [hfmDocumentIndexExtension, hfmBlocksField];
}
