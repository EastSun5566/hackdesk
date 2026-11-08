import { isSafeFontStack } from './themes';

type LocalFontData = { family: string };
type LocalFontWindow = Window & { queryLocalFonts?: () => Promise<LocalFontData[]> };

const MONOSPACE_FAMILY_RE = /\b(mono|code|consol|courier|menlo|terminal|fixed)/i;

/** Installed font families, sorted, or an empty list where the platform does not expose them. */
export async function listLocalFontFamilies(win: LocalFontWindow = window): Promise<string[]> {
  if (typeof win.queryLocalFonts !== 'function') return [];
  try {
    const fonts = await win.queryLocalFonts();
    const families = new Set<string>();
    for (const font of fonts) {
      // Dot-prefixed families are macOS system internals, not fonts to pick.
      if (font.family && !font.family.startsWith('.')) families.add(font.family);
    }
    return [...families]
      .filter((family) => isSafeFontStack(buildFontStack(family)))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** A stack for one family, falling back to a generic face of the same kind. */
export function buildFontStack(family: string) {
  const fallback = MONOSPACE_FAMILY_RE.test(family) ? 'ui-monospace, monospace' : 'system-ui, sans-serif';
  return `"${family.replace(/"/g, '')}", ${fallback}`;
}

/** The first family of a stack, without quotes: what the picker shows as the current font. */
export function primaryFontFamily(stack: string) {
  return stack.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? '';
}
