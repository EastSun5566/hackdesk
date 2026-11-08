import { describe, expect, it } from 'vitest';

import { buildFontStack, listLocalFontFamilies, primaryFontFamily } from './local-fonts';
import { isSafeFontStack } from './themes';

describe('local fonts', () => {
  it('lists each installed family once, sorted, without macOS internal faces', async () => {
    const win = {
      queryLocalFonts: async () => [
        { family: 'Inter' }, { family: 'Inter' }, { family: '.SF NS' }, { family: 'Avenir Next' }, { family: 'Bad{Font}' },
      ],
    } as unknown as Window;
    await expect(listLocalFontFamilies(win)).resolves.toEqual(['Avenir Next', 'Inter']);
  });

  it('returns no families where the platform does not expose them or access is denied', async () => {
    await expect(listLocalFontFamilies({} as Window)).resolves.toEqual([]);
    const denied = { queryLocalFonts: async () => { throw new Error('denied'); } } as unknown as Window;
    await expect(listLocalFontFamilies(denied)).resolves.toEqual([]);
  });

  it('builds a safe stack with a fallback of the same kind', () => {
    expect(buildFontStack('Avenir Next')).toBe('"Avenir Next", system-ui, sans-serif');
    expect(buildFontStack('JetBrains Mono')).toBe('"JetBrains Mono", ui-monospace, monospace');
    expect(isSafeFontStack(buildFontStack('Avenir Next'))).toBe(true);
    expect(primaryFontFamily('"Avenir Next", system-ui')).toBe('Avenir Next');
  });
});
