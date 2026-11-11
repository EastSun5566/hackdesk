import { describe, expect, it } from 'vitest';

import { applyImageSize } from './hfm-blocks';

describe('applyImageSize', () => {
  it('renders a given width as the image width, scaling small images up', () => {
    const image = document.createElement('img');
    applyImageSize(image, { value: 200, unit: 'px' }, undefined, { width: 40, height: 20 });
    expect(image.style.width).toBe('200px');
    expect(image.style.height).toBe('');
    expect(image.getAttribute('width')).toBe('200');
    expect(image.getAttribute('height')).toBeNull();
  });

  it('supports percentage widths and pixel heights, and ignores percentage heights', () => {
    const percent = document.createElement('img');
    applyImageSize(percent, { value: 50, unit: '%' }, { value: 20, unit: '%' }, undefined);
    expect(percent.style.width).toBe('50%');
    expect(percent.style.height).toBe('');

    const tall = document.createElement('img');
    applyImageSize(tall, undefined, { value: 90, unit: 'px' }, undefined);
    expect(tall.style.height).toBe('90px');
  });

  it('reserves the cached natural size for unsized images', () => {
    const image = document.createElement('img');
    applyImageSize(image, undefined, undefined, { width: 640, height: 360 });
    expect([image.width, image.height]).toEqual([640, 360]);
  });
});
