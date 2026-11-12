import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  APP_ICON_IDS,
  APP_ICON_OPTIONS,
  APP_ICON_VARIANT_IDS,
  DEFAULT_APP_ICON,
  PACKAGED_APP_ICON,
  getAppIconDataUri,
  isAppIconId,
  renderAppIconSvg,
  renderTrayTemplateSvg,
  resolveAppIconVariant,
} from './app-icons';

const appIconsDir = join(__dirname, '../../build/app-icons');

describe('app icon catalog', () => {
  it('lists every renderable variant exactly once, plus the system option', () => {
    expect(new Set(APP_ICON_IDS).size).toBe(APP_ICON_IDS.length);
    expect([...APP_ICON_IDS].sort()).toEqual(['system', ...APP_ICON_VARIANT_IDS].sort());
    expect(APP_ICON_IDS).toContain(DEFAULT_APP_ICON);
    expect(APP_ICON_VARIANT_IDS).toContain(PACKAGED_APP_ICON);
  });

  it('keeps at least one option in every picker group', () => {
    expect(new Set(APP_ICON_OPTIONS.map((option) => option.group))).toEqual(new Set(['classic', 'single', 'fun', 'secret']));
  });

  it('keeps Gold, Building Blocks, and Sushi behind the secret unlock', () => {
    const secret = APP_ICON_OPTIONS.filter((option) => option.group === 'secret').map((option) => option.id);
    expect(secret).toEqual(['blocks', 'gold', 'sushi']);
  });

  it('fills the mark\'s open top faces beneath the mark for gunkan-style icons', () => {
    const svg = renderAppIconSvg('sushi');
    const rice = svg.indexOf('fill="#FBF6EA"');
    const nori = svg.indexOf('fill="url(#mark-fill)"');
    expect(rice).toBeGreaterThan(-1);
    expect(rice).toBeLessThan(nori);
    expect(svg.match(/fill="#FF6A2B"/g)?.length).toBeGreaterThan(10);
  });

  it('draws the Pixel icons as shaded pixel art on a dithered screen', () => {
    const svg = renderAppIconSvg('pixel');
    const fills = new Set([...svg.matchAll(/<rect [^>]*fill="(#[0-9A-F]{6})"/g)].map(([, fill]) => fill));
    expect(svg).toContain('shape-rendering="crispEdges"');
    // Outline, body, face, the three sprite shades, two screen tones, and the drop shadow.
    for (const tone of ['#0F380F', '#306230', '#9BBC0F', '#4F7F2A', '#1E4A1E', '#86A70F', '#8BAC0F', '#77970B', '#5E7E0A']) {
      expect(fills, tone).toContain(tone);
    }
    expect(renderAppIconSvg('pixel-purple')).toContain('fill="#453AFF"');
  });

  it('draws the CRT icon with bloom behind the mark and tube effects over it', () => {
    const svg = renderAppIconSvg('crt');
    const bloom = svg.indexOf('filter="url(#pixel-bloom)"');
    const outline = svg.indexOf('fill="#4A2600"');
    const vignette = svg.indexOf('fill="url(#pixel-vignette)"');
    expect(bloom).toBeGreaterThan(-1);
    expect(bloom).toBeLessThan(outline);
    expect(vignette).toBeGreaterThan(outline);
    expect(svg).toContain('stroke="rgba(0,0,0,0.2)"');
  });

  it('resolves the system option from the OS appearance', () => {
    expect(resolveAppIconVariant('system', false)).toBe('color-light');
    expect(resolveAppIconVariant('system', true)).toBe('color-dark');
    expect(resolveAppIconVariant('nightly', true)).toBe('nightly');
  });

  it('recognizes only known icon ids', () => {
    expect(isAppIconId('neon')).toBe(true);
    expect(isAppIconId('retired-icon')).toBe(false);
    expect(isAppIconId(undefined)).toBe(false);
  });

  it.each(APP_ICON_IDS)('renders %s as well-formed SVG for both plate shapes', (id) => {
    for (const shape of ['macos', 'square'] as const) {
      const svg = renderAppIconSvg(id, shape);
      const document = new DOMParser().parseFromString(svg, 'image/svg+xml');

      expect(document.querySelector('parsererror')).toBeNull();
      expect(document.documentElement.getAttribute('viewBox')).toBe('0 0 1024 1024');
      // Every url(#id) reference must point at a definition in the same document.
      for (const [, refId] of svg.matchAll(/url\(#([^)]+)\)/g)) {
        expect(document.getElementById(refId), `${id}/${shape} references #${refId}`).not.toBeNull();
      }
    }
  });

  it('only draws the macOS drop shadow on the macOS plate', () => {
    expect(renderAppIconSvg('color-light', 'macos')).toContain('feDropShadow');
    expect(renderAppIconSvg('color-light', 'square')).not.toContain('feDropShadow');
  });

  it('renders the menu bar template as a single black silhouette', () => {
    const svg = renderTrayTemplateSvg(18);
    expect(svg).toContain('width="18"');
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg).toContain('fill="#000000"');
  });

  it('encodes previews as SVG data URIs', () => {
    expect(getAppIconDataUri('brand')).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
  });

  it.each(APP_ICON_VARIANT_IDS)('has generated runtime assets for %s (run `pnpm icons:generate`)', (id) => {
    expect(existsSync(join(appIconsDir, `${id}.png`))).toBe(true);
    expect(existsSync(join(appIconsDir, `${id}-square.png`))).toBe(true);
  });

  it('has generated the menu bar template assets', () => {
    expect(existsSync(join(appIconsDir, 'trayTemplate.png'))).toBe(true);
    expect(existsSync(join(appIconsDir, 'trayTemplate@2x.png'))).toBe(true);
  });
});
