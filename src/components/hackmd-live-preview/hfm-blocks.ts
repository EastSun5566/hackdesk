import {
  StateField,
  StateEffect,
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
import { formatImageSize } from './hfm-images';
import type { ImageSize } from './hfm-types';
import { treeGrowthEffect } from './tree-progress';
import { resolvePreviewImageSource, type LocalImageContext } from '@/lib/local-image';

export const setLocalImageContext = StateEffect.define<LocalImageContext | null>();
const localImageContextField = StateField.define<LocalImageContext | null>({
  create: () => null,
  update(context, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setLocalImageContext)) context = effect.value;
    }
    return context;
  },
});

const imageDimensionCache = new Map<string, { height: number; width: number }>();
const MAX_IMAGE_CACHE_ENTRIES = 128;
const fallbackImagePreviewHeight = 260;

class ImagePreviewWidget extends WidgetType {
  constructor(
    private readonly src: string | null,
    private readonly alt: string,
    private readonly lineTo: number,
    private readonly width?: ImageSize,
    private readonly height?: ImageSize,
  ) {
    super();
  }

  eq(other: ImagePreviewWidget): boolean {
    return other.src === this.src
      && other.alt === this.alt
      && other.lineTo === this.lineTo
      && sameSize(other.width, this.width)
      && sameSize(other.height, this.height);
  }

  get estimatedHeight(): number {
    if (this.height?.unit === 'px') {
      return this.height.value + 48;
    }

    const cached = this.src ? imageDimensionCache.get(this.src) : undefined;
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
    if (this.src) image.src = this.src;
    image.alt = this.alt;
    image.loading = 'lazy';

    applyImageSize(image, this.width, this.height, this.src ? imageDimensionCache.get(this.src) : undefined);

    image.addEventListener('load', () => {
      if (!this.src || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
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

    const unavailable = document.createElement('span');
    unavailable.textContent = 'Image unavailable';
    unavailable.hidden = Boolean(this.src);
    image.hidden = !this.src;
    image.addEventListener('error', () => {
      image.hidden = true;
      unavailable.hidden = false;
      view.requestMeasure();
    });
    wrap.appendChild(unavailable);

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
  const context = state.field(localImageContextField);

  for (const image of getHfmDocumentIndex(state).images) {
    ranges.push(Decoration.widget({
      block: true,
      side: 1,
      widget: new ImagePreviewWidget(resolvePreviewImageSource(image.src, context), image.alt, image.lineTo, image.width, image.height),
    }).range(image.lineTo));
  }

  return Decoration.set(ranges, true);
}

const hfmBlocksField = StateField.define<DecorationSet>({
  create: (state) => buildHfmBlocks(state),
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(treeGrowthEffect) || effect.is(setLocalImageContext)) {
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

export function hfmBlocks(context: LocalImageContext | null = null): Extension {
  return [hfmDocumentIndexExtension, localImageContextField.init(() => context), hfmBlocksField];
}

function sameSize(left?: ImageSize, right?: ImageSize): boolean {
  return left?.value === right?.value && left?.unit === right?.unit;
}

/**
 * Sizes the image the way HackMD does: a given width or height is the rendered size (so a small
 * image scales up), a missing side follows the aspect ratio, and the theme caps the width at the
 * column. A percentage height has no box to resolve against, on HackMD too, so it is ignored.
 */
export function applyImageSize(
  image: HTMLImageElement,
  width: ImageSize | undefined,
  height: ImageSize | undefined,
  natural: { height: number; width: number } | undefined,
) {
  // Pixel sizes also go on the attributes, which reserve the box (and its aspect ratio) before load.
  if (width) {
    image.style.width = formatImageSize(width);
    if (width.unit === 'px') image.width = width.value;
  }
  if (height?.unit === 'px') {
    image.style.height = formatImageSize(height);
    image.height = height.value;
  }
  if (natural && !width && !height) {
    // Reserve the natural box before the image loads, so the editor's height map stays stable.
    image.width = natural.width;
    image.height = natural.height;
  }
}
