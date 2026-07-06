import { describe, expect, it } from 'vitest';

import { decodeFolderIcon, normalizeFolderColor } from './folder-glyph-utils';

describe('folder glyph utilities', () => {
  it('normalizes safe hex folder colors', () => {
    expect(normalizeFolderColor('#abc')).toBe('#abc');
    expect(normalizeFolderColor('#abcd')).toBe('#abcd');
    expect(normalizeFolderColor('#aabbcc')).toBe('#aabbcc');
    expect(normalizeFolderColor('#aabbccdd')).toBe('#aabbccdd');
  });

  it('rejects non-hex colors and CSS injection surfaces', () => {
    expect(normalizeFolderColor(null)).toBeNull();
    expect(normalizeFolderColor('red')).toBeNull();
    expect(normalizeFolderColor('#12')).toBeNull();
    expect(normalizeFolderColor('#12345')).toBeNull();
    expect(normalizeFolderColor('var(--primary-default)')).toBeNull();
    expect(normalizeFolderColor('#fff; color: red')).toBeNull();
    expect(normalizeFolderColor('url(https://example.com)')).toBeNull();
  });

  it('decodes single and multi-codepoint folder icon values', () => {
    expect(decodeFolderIcon('1F525')).toBe('🔥');
    expect(decodeFolderIcon('1F468-200D-1F4BB')).toBe('👨‍💻');
  });

  it('rejects malformed or out-of-range folder icon values', () => {
    expect(decodeFolderIcon(null)).toBeNull();
    expect(decodeFolderIcon('not-an-icon')).toBeNull();
    expect(decodeFolderIcon('1F525;alert(1)')).toBeNull();
    expect(decodeFolderIcon('110000')).toBeNull();
  });
});
