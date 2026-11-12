/**
 * App icon catalog. Every variant is composed from the two HackMD marks below,
 * so the Settings previews and the generated PNG/ICNS/ICO assets
 * (`pnpm icons:generate`) share one source of truth.
 *
 * Keep this module free of `@/` imports: `scripts/generate-icons.ts` runs it
 * directly under Node.
 */

const MARKS = {
  double: {
    width: 103,
    height: 95,
    path: 'M102.701 51.382C102.725 47.3549 101.459 45.0981 98.2599 43.5272L78.6924 33.9231C77.919 33.5425 77.1274 33.2071 76.3269 32.9171L76.2 19.8902C76.1124 16.0595 74.9402 13.6215 71.7409 12.0505L52.1733 2.44649C45.3517 -0.90389 37.3428 -0.807216 30.6028 2.70026L5.45834 15.7876C2.6729 17.2377 1.23487 19.9265 1.17142 22.6575L0.00226527 42.3761C-0.046072 44.2371 0.675966 46.231 2.47653 47.2944L23.4126 59.6416C24.6543 60.3757 25.9473 60.986 27.2736 61.4754L26.6361 73.9313C26.5576 75.9041 27.189 77.7107 28.9926 78.7711L49.9287 91.1182C57.3061 95.4686 66.4479 95.5411 73.8919 91.3056L100.556 76.1337C102.396 75.0884 103.003 73.2606 103 71.2697L102.695 51.382H102.701ZM26.6512 34.8446C22.2102 32.8265 10.1108 26.4973 9.18031 25.9868C7.09576 24.8357 6.99909 23.6152 7.10785 22.147C7.15619 21.4733 7.3737 20.8116 7.75436 20.2316C8.13502 19.6485 8.67881 19.15 9.38574 18.7966C10.3857 18.2981 33.3278 6.81195 33.3278 6.81195C37.8292 4.57333 43.0497 4.28331 47.7414 5.94188C48.4121 6.17752 49.0707 6.45546 49.7172 6.77268C53.986 8.86629 62.5266 13.0535 66.7923 15.1562C66.8014 15.1622 66.8225 15.1713 66.8346 15.1773C68.605 16.0625 69.3421 17.8903 69.037 19.5519C68.8285 20.6999 68.2273 21.7029 66.9132 22.4128C66.5809 22.5941 48.2399 32.322 44.5874 34.2524C39.0165 37.201 32.4034 37.4548 26.6542 34.8415L26.6512 34.8446ZM95.4805 51.5874C95.3023 52.814 94.6044 53.9801 93.3688 54.7021L70.5687 68.0402C64.88 71.3664 57.8711 71.4873 52.0706 68.3604L35.3399 59.3335C32.3037 57.696 32.2855 53.3457 35.3096 51.6811L57.9466 39.2342C63.2063 36.343 69.5264 36.1225 74.9734 38.6451L93.0002 46.9893C94.541 47.7023 95.3869 49.1101 95.5107 50.5753C95.5379 50.9137 95.5289 51.2551 95.4805 51.5904V51.5874Z',
  },
  single: {
    width: 103,
    height: 84.3425,
    path: 'M102.801 26.6198C102.801 22.1426 100.789 18.2473 96.4864 16.1464L70.1432 3.2777C65.66 1.08741 60.7966 -0.0035682 55.9367 8.76706e-06C50.824 -0.0035682 45.7125 1.20425 41.0517 3.61752L7.19569 21.153C3.44345 23.0965 1.56435 26.7152 1.42366 30.372C1.16969 36.9942 0.383951 50.2433 0.0143311 56.8655C-0.126363 59.3932 0.757148 61.9388 3.18472 63.3636L31.37 79.9035C41.3033 85.7328 53.6116 85.8282 63.6343 80.1539L99.5351 59.8284C102.01 58.4274 103.016 55.784 103 53.3171L102.801 26.621V26.6198ZM92.9797 26.2299C92.6972 27.7656 91.8864 29.1082 90.1146 30.0585C89.6651 30.2993 64.9244 43.3171 60.0001 45.9009C52.4837 49.8451 43.5651 50.1849 35.8126 46.6878C29.8224 43.986 13.5007 35.5193 12.2464 34.8337C9.43368 33.2956 9.30372 31.661 9.44918 29.6972C9.51595 28.797 9.80688 27.9111 10.3196 27.1337C10.8323 26.3551 11.5679 25.685 12.5218 25.2141C13.8703 24.5487 44.8171 9.17851 44.8171 9.17851C50.8884 6.18459 57.9302 5.79589 64.2579 8.016C65.1617 8.33315 66.0511 8.70397 66.9215 9.12724C72.6805 11.9304 84.2007 17.5307 89.9524 20.3458C89.9667 20.353 89.9954 20.3661 90.0085 20.3732C92.3943 21.556 93.3887 24.0015 92.9786 26.2287L92.9797 26.2299Z',
  },
} as const;

const BRAND_LIGHT = '#9894F9';
const BRAND_DEEP = '#453AFF';

type Fill = string | { stops: string[]; from?: [number, number]; to?: [number, number] };

type MarkLayer = {
  /** Which mark to draw, or a stack of single tiles. */
  shape: 'double' | 'single' | 'tower';
  fill: Fill | 'none';
  stroke?: { color: Fill; width: number };
  /** Per-tile fills when `shape` is `tower`, bottom to top. */
  towerFills?: string[];
  /** Fill for the mark's open top faces (its inner holes), drawn beneath the mark. */
  innerFill?: string;
  /** Draws the mark as pixel art on a grid of `cell` mark units, four-tone like an old handheld. */
  pixel?: PixelStyle;
  /** A soft pile of powder on each top face: a haze, a mound, and a faint shadow under it. */
  dusting?: { color: string; shade: string };
  /** Dots laid on the mark, in the mark's own coordinates: [x, y, radius]. */
  toppings?: { color: string; shine?: string; dots: [number, number, number][] };
  /** Seedlings standing on the mark, in its coordinates: [x, y of the soil, height]. */
  sprouts?: { stem: string; leaf: string; leafShade: string; at: [number, number, number][] };
  glow?: string;
  opacity?: number;
};

/**
 * Pixel-art mark. The four base tones are required; every other key turns on
 * one more layer of shading.
 */
type PixelStyle = {
  /** Cell size, in mark units. */
  cell: number;
  outline: string;
  body: string;
  face: string;
  /** Lit top row and shadowed, dithered bottom rows of the body. */
  sprite?: { light: string; shadow: string; faceShade: string };
  /** Screen colour behind the mark, dithered from `top` to `bottom` on the same grid. */
  screen?: { top: string; bottom: string };
  /** The silhouette repeated one cell down and right, like LCD ghosting. */
  dropShadow?: string;
};

type Decoration = 'stars' | 'grid' | 'scanlines' | 'highlight' | 'bento';

type AppIconDesign = {
  background: Fill;
  mark: MarkLayer;
  decorations?: Decoration[];
};

export type AppIconGroup = 'classic' | 'single' | 'fun' | 'secret';

const LIGHT_PLATE: Fill = { stops: ['#FFFFFF', '#EEEEF4'], from: [0.5, 0], to: [0.5, 1] };
const DARK_PLATE: Fill = { stops: ['#2A2A31', '#121216'], from: [0.5, 0], to: [0.5, 1] };
const BRAND_MARK: Fill = { stops: [BRAND_LIGHT, BRAND_DEEP], from: [0.22, 0.08], to: [0.72, 0.95] };
const BRAND_MARK_ON_DARK: Fill = { stops: ['#B3AFFF', '#5B51FF'], from: [0.22, 0.08], to: [0.72, 0.95] };

type Point = [number, number];

type Dot = [number, number, number];

function hash(x: number, y: number) {
  const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return seed - Math.floor(seed);
}

/**
 * Packs dots in a hexagonal grid over a tile's top face, shrunk toward its
 * centre so a sliver of the face still shows. `corners` go left, top, right,
 * bottom. A small, deterministic jitter keeps the grid from looking
 * machine-made; `keep` below 1 drops dots for a sparse scatter.
 */
function dotsOn(corners: Point[], radius: number, coverage = 0.86, keep = 1): Dot[] {
  const cx = corners.reduce((sum, [x]) => sum + x, 0) / corners.length;
  const cy = corners.reduce((sum, [, y]) => sum + y, 0) / corners.length;
  const shrunk = corners.map(([x, y]): Point => [cx + (x - cx) * coverage, cy + (y - cy) * coverage]);
  const inside = (x: number, y: number) => shrunk.every(([x1, y1], index) => {
    const [x2, y2] = shrunk[(index + 1) % shrunk.length];
    return (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1) >= 0;
  });

  const xs = shrunk.map(([x]) => x);
  const ys = shrunk.map(([, y]) => y);
  const stepX = radius * 2;
  const stepY = radius * Math.sqrt(3);
  const dots: Dot[] = [];
  for (let row = 0, y = Math.min(...ys); y <= Math.max(...ys); row += 1, y += stepY) {
    for (let x = Math.min(...xs) + (row % 2) * radius; x <= Math.max(...xs); x += stepX) {
      if (!inside(x, y) || (keep < 1 && hash(y, x) > keep)) {
        continue;
      }
      const jitter = hash(x, y) - 0.5;
      dots.push([round(x + jitter * radius * 0.4), round(y - jitter * radius * 0.3), round(radius * (1 + jitter * 0.18))]);
    }
  }
  return dots;
}

/** The double mark's two open top faces (left, top, right, bottom), measured from its path. */
const DOUBLE_FACES: Point[][] = [
  [[7, 23.6], [43, 4.3], [69.3, 17.9], [32.4, 37.5]],
  [[32.3, 53.3], [69.5, 36.1], [95.5, 50.9], [57.9, 71.5]],
];

function dotsOnFaces(radius: number, coverage?: number, keep?: number) {
  return DOUBLE_FACES.flatMap((face) => dotsOn(face, radius, coverage, keep));
}

const DESIGNS = {
  'color-light': { background: LIGHT_PLATE, mark: { shape: 'double', fill: BRAND_MARK } },
  'color-dark': { background: DARK_PLATE, mark: { shape: 'double', fill: BRAND_MARK_ON_DARK } },
  'solid-light': { background: LIGHT_PLATE, mark: { shape: 'double', fill: BRAND_DEEP } },
  'solid-dark': { background: DARK_PLATE, mark: { shape: 'double', fill: '#FFFFFF' } },
  brand: {
    background: { stops: [BRAND_LIGHT, BRAND_DEEP], from: [0.15, 0], to: [0.85, 1] },
    mark: { shape: 'double', fill: '#FFFFFF' },
  },
  'color-light-single': { background: LIGHT_PLATE, mark: { shape: 'single', fill: BRAND_MARK } },
  'color-dark-single': { background: DARK_PLATE, mark: { shape: 'single', fill: BRAND_MARK_ON_DARK } },
  'solid-light-single': { background: LIGHT_PLATE, mark: { shape: 'single', fill: BRAND_DEEP } },
  'solid-dark-single': { background: DARK_PLATE, mark: { shape: 'single', fill: '#FFFFFF' } },
  nightly: {
    background: { stops: ['#271A5C', '#05060F'], from: [0.8, 0], to: [0.2, 1] },
    mark: { shape: 'double', fill: { stops: ['#D9D7FF', '#7A70FF'], from: [0.22, 0.08], to: [0.72, 0.95] }, glow: '#8C84FF' },
    decorations: ['stars'],
  },
  glass: {
    background: { stops: ['#C9C6FF', '#6C63FF', '#2E25C9'], from: [0, 0], to: [1, 1] },
    mark: { shape: 'double', fill: '#FFFFFF', opacity: 0.55, stroke: { color: '#FFFFFF', width: 1.4 } },
    decorations: ['highlight'],
  },
  blueprint: {
    background: { stops: ['#2563EB', '#1E3A8A'], from: [0.5, 0], to: [0.5, 1] },
    mark: { shape: 'double', fill: 'rgba(255,255,255,0.12)', stroke: { color: '#FFFFFF', width: 1.8 } },
    decorations: ['grid'],
  },
  neon: {
    background: '#0B0A12',
    mark: {
      shape: 'double',
      fill: 'none',
      stroke: { color: { stops: ['#FF4FD8', '#4FE8FF'], from: [0, 0], to: [1, 1] }, width: 2.6 },
      glow: '#FF4FD8',
    },
  },
  terminal: {
    background: { stops: ['#0F1A12', '#050806'], from: [0.5, 0], to: [0.5, 1] },
    mark: { shape: 'double', fill: '#3DFF7A', glow: '#3DFF7A' },
    decorations: ['scanlines'],
  },
  spectrum: {
    background: DARK_PLATE,
    mark: {
      shape: 'double',
      fill: { stops: ['#FF5F6D', '#FFC371', '#7CFFB2', '#4FC3FF', '#9B7BFF'], from: [0.1, 0], to: [0.9, 1] },
    },
  },
  sketch: {
    background: '#FBF7EE',
    mark: { shape: 'double', fill: 'none', stroke: { color: '#26231F', width: 2 } },
  },
  sunset: {
    background: { stops: ['#FFC37A', '#FF6F91', '#7B5CF0'], from: [0.5, 0], to: [0.5, 1] },
    mark: { shape: 'double', fill: '#FFF6EA' },
  },
  mint: {
    background: { stops: ['#EAFBF3', '#B5ECD6'], from: [0.5, 0], to: [0.5, 1] },
    mark: { shape: 'single', fill: { stops: ['#CFC4FF', '#8C7BFF'], from: [0.22, 0.08], to: [0.72, 0.95] } },
  },
  paper: {
    background: { stops: ['#FCFBF7', '#EFECE3'], from: [0.5, 0], to: [0.5, 1] },
    mark: { shape: 'double', fill: '#1E3A8A' },
  },
  dracula: {
    background: { stops: ['#343746', '#21222C'], from: [0.5, 0], to: [0.5, 1] },
    mark: { shape: 'double', fill: { stops: ['#FF79C6', '#BD93F9'], from: [0.2, 0], to: [0.8, 1] } },
  },
  solarized: {
    background: { stops: ['#073642', '#002B36'], from: [0.5, 0], to: [0.5, 1] },
    mark: { shape: 'double', fill: { stops: ['#B58900', '#CB4B16'], from: [0.2, 0], to: [0.8, 1] }, innerFill: '#2AA198' },
  },
  nord: {
    background: { stops: ['#3B4252', '#2E3440'], from: [0.5, 0], to: [0.5, 1] },
    mark: { shape: 'double', fill: { stops: ['#8FBCBB', '#5E81AC'], from: [0.2, 0], to: [0.8, 1] } },
  },
  pixel: {
    background: '#8BAC0F',
    mark: {
      shape: 'double',
      fill: 'none',
      pixel: {
        cell: 4.4,
        outline: '#0F380F',
        body: '#306230',
        face: '#9BBC0F',
        sprite: { light: '#4F7F2A', shadow: '#1E4A1E', faceShade: '#86A70F' },
        screen: { top: '#8BAC0F', bottom: '#77970B' },
        dropShadow: '#5E7E0A',
      },
    },
  },
  'pixel-purple': {
    background: '#F1EFFF',
    mark: {
      shape: 'double',
      fill: 'none',
      pixel: {
        cell: 4.4,
        outline: '#1B1464',
        body: BRAND_DEEP,
        face: '#D9D5FF',
        sprite: { light: '#7B73FF', shadow: '#2C22C9', faceShade: '#B4AEFF' },
        screen: { top: '#F1EFFF', bottom: '#DCD8FF' },
        dropShadow: '#BDB6F7',
      },
    },
  },
  matcha: {
    // A matcha latte: a glazed cup, milk foam, and a small pile of powder on top.
    background: { stops: ['#F1E6D3', '#D9C4A3'], from: [0.5, 0], to: [0.5, 1] },
    mark: {
      shape: 'double',
      fill: { stops: ['#7D93A8', '#3E5266'], from: [0.2, 0], to: [0.8, 1] },
      innerFill: '#FAF4E6',
      dusting: { color: '#8DB356', shade: '#73983F' },
      toppings: { color: 'rgba(125,163,72,0.55)', dots: dotsOnFaces(0.4, 0.58, 0.14) },
    },
  },
  garden: {
    background: { stops: ['#E4F4D8', '#B9DFA1'], from: [0.5, 0], to: [0.5, 1] },
    mark: {
      shape: 'double',
      fill: { stops: ['#E79466', '#A9532C'], from: [0.2, 0], to: [0.8, 1] },
      innerFill: '#5A3B24',
      sprouts: {
        stem: '#3F8F33',
        leaf: '#6CCB4F',
        leafShade: '#3FA03A',
        at: [[30, 22, 12], [46, 20, 15], [56, 53, 13], [73, 52, 16]],
      },
    },
  },
  blocks: {
    background: { stops: ['#FFF6E5', '#FDE7C2'], from: [0.5, 0], to: [0.5, 1] },
    mark: { shape: 'tower', fill: BRAND_DEEP, towerFills: [BRAND_DEEP, '#FFB020', '#FF5A5F'] },
  },
  sushi: {
    background: { stops: ['#EE5A45', '#C2301F'], from: [0.5, 0], to: [0.5, 1] },
    mark: {
      shape: 'double',
      fill: { stops: ['#34473A', '#141C17'], from: [0.2, 0], to: [0.8, 1] },
      innerFill: '#FBF6EA',
      toppings: { color: '#FF6A2B', shine: '#FFD2B8', dots: dotsOnFaces(1.9) },
    },
    decorations: ['bento'],
  },
  gold: {
    background: { stops: ['#1A1A1A', '#000000'], from: [0.5, 0], to: [0.5, 1] },
    mark: { shape: 'double', fill: { stops: ['#FFF1B8', '#E2B13C', '#9A6B12'], from: [0.2, 0], to: [0.8, 1] }, glow: '#E2B13C' },
  },
} satisfies Record<string, AppIconDesign>;

/** A concrete, renderable icon. */
export type AppIconVariantId = keyof typeof DESIGNS;
/** A user-selectable icon setting; `system` follows the OS light/dark appearance. */
export type AppIconId = 'system' | AppIconVariantId;

export type AppIconOption = {
  id: AppIconId;
  label: string;
  group: AppIconGroup;
};

export const APP_ICON_OPTIONS: readonly AppIconOption[] = [
  { id: 'system', label: 'Match Appearance', group: 'classic' },
  { id: 'color-light', label: 'Color / Light', group: 'classic' },
  { id: 'color-dark', label: 'Color / Dark', group: 'classic' },
  { id: 'solid-light', label: 'Solid / Light', group: 'classic' },
  { id: 'solid-dark', label: 'Solid / Dark', group: 'classic' },
  { id: 'brand', label: 'Brand', group: 'classic' },
  { id: 'color-light-single', label: 'Color / Light', group: 'single' },
  { id: 'color-dark-single', label: 'Color / Dark', group: 'single' },
  { id: 'solid-light-single', label: 'Solid / Light', group: 'single' },
  { id: 'solid-dark-single', label: 'Solid / Dark', group: 'single' },
  { id: 'nightly', label: 'Nightly', group: 'fun' },
  { id: 'glass', label: 'Glass', group: 'fun' },
  { id: 'blueprint', label: 'Blueprint', group: 'fun' },
  { id: 'neon', label: 'Neon', group: 'fun' },
  { id: 'terminal', label: 'Terminal', group: 'fun' },
  { id: 'spectrum', label: 'Spectrum', group: 'fun' },
  { id: 'sketch', label: 'Sketch', group: 'fun' },
  { id: 'sunset', label: 'Sunset', group: 'fun' },
  { id: 'mint', label: 'Mint', group: 'fun' },
  { id: 'paper', label: 'Paper', group: 'fun' },
  { id: 'dracula', label: 'Dracula', group: 'fun' },
  { id: 'solarized', label: 'Solarized', group: 'fun' },
  { id: 'nord', label: 'Nord', group: 'fun' },
  { id: 'pixel', label: 'Pixel', group: 'fun' },
  { id: 'pixel-purple', label: 'Pixel Purple', group: 'fun' },
  { id: 'matcha', label: 'Matcha', group: 'fun' },
  { id: 'garden', label: 'Garden', group: 'fun' },
  { id: 'blocks', label: 'Building Blocks', group: 'secret' },
  { id: 'gold', label: 'Gold', group: 'secret' },
  { id: 'sushi', label: 'Sushi', group: 'secret' },
];

export const APP_ICON_IDS = APP_ICON_OPTIONS.map((option) => option.id) as [AppIconId, ...AppIconId[]];
export const APP_ICON_VARIANT_IDS = Object.keys(DESIGNS) as AppIconVariantId[];
export const DEFAULT_APP_ICON: AppIconId = 'system';
/** The variant baked into the packaged .icns/.ico/.png. */
export const PACKAGED_APP_ICON: AppIconVariantId = 'color-light';

export function isAppIconId(value: unknown): value is AppIconId {
  return typeof value === 'string' && (APP_ICON_IDS as string[]).includes(value);
}

export function resolveAppIconVariant(id: AppIconId, prefersDark: boolean): AppIconVariantId {
  if (id === 'system') {
    return prefersDark ? 'color-dark' : 'color-light';
  }

  return id;
}

/**
 * - `macos`: Apple's icon grid — an 824pt rounded plate inset in a 1024 canvas, with drop shadow.
 * - `square`: a near full-bleed rounded tile for Windows and Linux taskbars.
 */
export type AppIconShape = 'macos' | 'square';

const CANVAS = 1024;
const PLATES: Record<AppIconShape, { inset: number; radius: number; shadow: boolean }> = {
  macos: { inset: 100, radius: 185, shadow: true },
  square: { inset: 24, radius: 200, shadow: false },
};

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function paintDef(id: string, fill: Fill): { ref: string; def: string } {
  if (typeof fill === 'string') {
    return { ref: fill, def: '' };
  }

  const [x1, y1] = fill.from ?? [0, 0];
  const [x2, y2] = fill.to ?? [1, 1];
  const last = fill.stops.length - 1;
  const stops = fill.stops
    .map((color, index) => `<stop offset="${last === 0 ? 0 : round(index / last)}" stop-color="${color}"/>`)
    .join('');

  return {
    ref: `url(#${id})`,
    def: `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`,
  };
}

function renderDecorations(decorations: Decoration[], plate: { x: number; size: number; radius: number }) {
  const { x, size } = plate;
  const at = (fx: number, fy: number) => [round(x + fx * size), round(x + fy * size)] as const;

  return decorations.map((decoration) => {
    switch (decoration) {
      case 'stars': {
        const stars: [number, number, number][] = [
          [0.16, 0.18, 7], [0.3, 0.1, 4], [0.48, 0.16, 5], [0.12, 0.42, 4],
          [0.86, 0.5, 5], [0.2, 0.84, 4], [0.9, 0.86, 6], [0.62, 0.9, 3],
        ];
        const dots = stars.map(([fx, fy, r]) => {
          const [cx, cy] = at(fx, fy);
          return `<circle cx="${cx}" cy="${cy}" r="${round(r * size / 824)}" fill="#FFFFFF" opacity="0.85"/>`;
        }).join('');
        const [mx, my] = at(0.8, 0.2);
        const moonR = round(size * 0.075);
        const moon = `<path d="M${mx} ${round(my - moonR)}a${moonR} ${moonR} 0 1 0 ${moonR} ${moonR}a${round(moonR * 0.78)} ${round(moonR * 0.78)} 0 0 1 -${moonR} -${moonR}z" fill="#FFF4C7"/>`;
        return dots + moon;
      }
      case 'grid': {
        const step = size / 12;
        const lines: string[] = [];
        for (let index = 1; index < 12; index += 1) {
          const offset = round(x + step * index);
          lines.push(`M${offset} ${x}V${x + size}`, `M${x} ${offset}H${x + size}`);
        }
        return `<path d="${lines.join('')}" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="${round(size / 412)}"/>`;
      }
      case 'scanlines': {
        const step = size / 64;
        const lines: string[] = [];
        for (let index = 0; index < 64; index += 2) {
          lines.push(`M${x} ${round(x + step * index)}H${x + size}`);
        }
        return `<path d="${lines.join('')}" stroke="#3DFF7A" stroke-opacity="0.06" stroke-width="${round(step)}"/>`;
      }
      case 'bento': {
        // A lacquer box: a gold rim inset from the plate edge, with a darker floor inside it.
        const inset = round(size * 0.07);
        const inner = round(size - inset * 2);
        const rimRadius = round(plate.radius * 0.7);
        return `<rect x="${round(x + inset)}" y="${round(x + inset)}" width="${inner}" height="${inner}" rx="${rimRadius}" fill="#000000" fill-opacity="0.08" stroke="#F2C14E" stroke-opacity="0.85" stroke-width="${round(size / 90)}"/>`;
      }
      case 'highlight':
        return `<ellipse cx="${round(x + size * 0.3)}" cy="${round(x + size * 0.12)}" rx="${round(size * 0.55)}" ry="${round(size * 0.28)}" fill="#FFFFFF" opacity="0.18"/>`;
      default:
        return '';
    }
  }).join('');
}

/** Flattens a path of absolute M/L/H/V/C/Z commands into one polygon per subpath. */
function flattenPath(d: string): Point[][] {
  const tokens = d.match(/[MLHVCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const polygons: Point[][] = [];
  let current: Point[] = [];
  let pen: Point = [0, 0];
  let index = 0;
  let command = '';
  const next = () => Number(tokens[index++]);
  while (index < tokens.length) {
    if (/^[MLHVCZ]$/i.test(tokens[index])) {
      command = tokens[index++].toUpperCase();
    }
    switch (command) {
      case 'M':
        if (current.length) polygons.push(current);
        pen = [next(), next()];
        current = [pen];
        command = 'L';
        break;
      case 'L':
        pen = [next(), next()];
        current.push(pen);
        break;
      case 'H':
        pen = [next(), pen[1]];
        current.push(pen);
        break;
      case 'V':
        pen = [pen[0], next()];
        current.push(pen);
        break;
      case 'C': {
        const [x0, y0] = pen;
        const x1 = next(); const y1 = next(); const x2 = next(); const y2 = next(); const x3 = next(); const y3 = next();
        for (let step = 1; step <= 12; step += 1) {
          const t = step / 12;
          const u = 1 - t;
          current.push([
            u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
          ]);
        }
        pen = [x3, y3];
        break;
      }
      case 'Z':
        if (current.length) polygons.push(current);
        current = [];
        break;
      default:
        index += 1;
    }
  }
  if (current.length) polygons.push(current);
  return polygons;
}

function insidePolygon([x, y]: Point, polygon: Point[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[previous];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * Samples the mark on a grid and draws each cell as a square: outline, body, or
 * open top face, plus whichever shading layers the style turns on. `area` is
 * the plate in mark units, so a dithered screen lines up with the mark's cells.
 */
function renderPixelMark(
  source: { width: number; height: number; path: string },
  pixel: PixelStyle,
  area: { x: number; y: number; size: number },
) {
  const [outer, ...holes] = flattenPath(source.path);
  const { cell } = pixel;
  const cols = Math.ceil(source.width / cell);
  const rows = Math.ceil(source.height / cell);
  const offsetX = (source.width - cols * cell) / 2;
  const offsetY = (source.height - rows * cell) / 2;
  const kinds = new Map<string, 'solid' | 'face' | 'empty'>();
  const kind = (col: number, row: number): 'solid' | 'face' | 'empty' => {
    const key = `${col},${row}`;
    const cached = kinds.get(key);
    if (cached) return cached;
    let value: 'solid' | 'face' | 'empty' = 'empty';
    if (col >= 0 && row >= 0 && col < cols && row < rows) {
      const point: Point = [offsetX + (col + 0.5) * cell, offsetY + (row + 0.5) * cell];
      if (insidePolygon(point, outer)) {
        value = holes.some((hole) => insidePolygon(point, hole)) ? 'face' : 'solid';
      }
    }
    kinds.set(key, value);
    return value;
  };
  const isEdge = (col: number, row: number) => kind(col, row) === 'solid'
    && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => kind(col + dx, row + dy) !== 'solid');

  // A hair of overlap hides seams between neighbouring squares when scaled.
  const square = (col: number, row: number, color: string) =>
    `<rect x="${round(offsetX + col * cell)}" y="${round(offsetY + row * cell)}" width="${round(cell + 0.05)}" height="${round(cell + 0.05)}" fill="${color}"/>`;

  const layers: string[] = [];

  if (pixel.screen) {
    const firstCol = Math.floor((area.x - offsetX) / cell) - 1;
    const firstRow = Math.floor((area.y - offsetY) / cell) - 1;
    const span = Math.ceil(area.size / cell) + 3;
    for (let row = firstRow; row < firstRow + span; row += 1) {
      // Dither only across the middle band; the top and bottom stay solid.
      const t = Math.min(1, Math.max(0, ((row - firstRow) / span - 0.2) / 0.6));
      for (let col = firstCol; col < firstCol + span; col += 1) {
        const threshold = (BAYER_4[((row % 4) + 4) % 4][((col % 4) + 4) % 4] + 0.5) / 16;
        layers.push(square(col, row, t > threshold ? pixel.screen.bottom : pixel.screen.top));
      }
    }
  }

  if (pixel.dropShadow) {
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        // Only where the shifted copy lands outside the mark; elsewhere the mark covers it.
        if (kind(col, row) !== 'empty' && kind(col + 1, row + 1) === 'empty') {
          layers.push(square(col + 1, row + 1, pixel.dropShadow));
        }
      }
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const here = kind(col, row);
      if (here === 'empty') continue;
      let color: string;
      if (here === 'face') {
        // The rim casts a shadow onto the face just below and right of it.
        const underRim = isEdge(col, row - 1) || isEdge(col - 1, row);
        color = pixel.sprite && underRim ? pixel.sprite.faceShade : pixel.face;
      } else if (isEdge(col, row)) {
        color = pixel.outline;
      } else if (pixel.sprite) {
        const nearBottom = isEdge(col, row + 1) ? 1 : isEdge(col, row + 2) ? 2 : 0;
        if (isEdge(col, row - 1) && kind(col, row - 2) !== 'solid') {
          color = pixel.sprite.light;
        } else if (nearBottom === 1 || (nearBottom === 2 && (col + row) % 2 === 0)) {
          color = pixel.sprite.shadow;
        } else {
          color = pixel.body;
        }
      } else {
        color = pixel.body;
      }
      layers.push(square(col, row, color));
    }
  }

  return `<g shape-rendering="crispEdges">${layers.join('')}</g>`;
}

/** A curved stem with two pointed leaves; drawn back to front so nearer plants overlap. */
function renderSprouts({ stem, leaf, leafShade, at }: NonNullable<MarkLayer['sprouts']>) {
  return [...at].sort(([, a], [, b]) => a - b).map(([x, y, height]) => {
    const scale = height / 9;
    const tx = x;
    const ty = round(y - height);
    const leafPath = (side: 1 | -1, lift: number, size: number) => {
      const k = scale * size * side;
      const v = scale * size;
      const oy = ty - lift * scale;
      return `M${tx} ${round(oy)}C${round(tx + 1.4 * k)} ${round(oy - 3.6 * v)} ${round(tx + 5 * k)} ${round(oy - 3.4 * v)} ${round(tx + 5.6 * k)} ${round(oy - 1.8 * v)}C${round(tx + 4.2 * k)} ${round(oy + 0.6 * v)} ${round(tx + 1.4 * k)} ${round(oy + 0.8 * v)} ${tx} ${round(oy)}Z`;
    };
    const stemPath = `M${x} ${y}Q${round(x + 1.2 * scale)} ${round(y - height / 2)} ${tx} ${ty}`;
    return `<path d="${stemPath}" fill="none" stroke="${stem}" stroke-width="${round(1.5 * scale)}" stroke-linecap="round"/>`
      + `<path d="${leafPath(-1, 0, 1.35)}" fill="${leafShade}"/>`
      + `<path d="${leafPath(1, 0.6, 1.5)}" fill="${leaf}"/>`;
  }).join('');
}

function renderMark(mark: MarkLayer, plate: { x: number; size: number }, defs: string[]) {
  const towerStep = 30;
  const towerCount = 3;
  const source = mark.shape === 'double' ? MARKS.double : MARKS.single;
  const width = source.width;
  const height = mark.shape === 'tower' ? source.height + towerStep * (towerCount - 1) : source.height;
  const scale = (plate.size * (mark.shape === 'tower' ? 0.56 : 0.6)) / Math.max(width, height);
  const tx = round(plate.x + (plate.size - width * scale) / 2);
  const ty = round(plate.x + (plate.size - height * scale) / 2);

  const fill = mark.fill === 'none' ? { ref: 'none', def: '' } : paintDef('mark-fill', mark.fill);
  const stroke = mark.stroke ? paintDef('mark-stroke', mark.stroke.color) : null;
  defs.push(fill.def, stroke?.def ?? '');

  const strokeAttrs = stroke && mark.stroke
    ? ` stroke="${stroke.ref}" stroke-width="${mark.stroke.width}" stroke-linejoin="round"`
    : '';
  const opacity = mark.opacity === undefined ? '' : ` fill-opacity="${mark.opacity}"`;

  let body: string;
  if (mark.shape === 'tower') {
    const fills = mark.towerFills ?? [];
    body = Array.from({ length: towerCount }, (_, index) => {
      const y = round(towerStep * (towerCount - 1 - index));
      const tileFill = fills[index] ?? fill.ref;
      return `<path transform="translate(0 ${y})" d="${source.path}" fill-rule="evenodd" fill="${tileFill}" stroke="#FFF6E5" stroke-width="3" paint-order="stroke"/>`;
    }).join('');
  } else if (mark.pixel) {
    const markScale = round(scale);
    body = renderPixelMark(source, mark.pixel, {
      x: (plate.x - tx) / markScale,
      y: (plate.x - ty) / markScale,
      size: plate.size / markScale,
    });
  } else {
    // The first subpath is the outline; the rest are the open top faces.
    const holes = source.path.split(/(?=M)/).slice(1).join('');
    const inner = mark.innerFill && holes ? `<path d="${holes}" fill="${mark.innerFill}"/>` : '';
    let dusting = '';
    if (mark.dusting && holes) {
      // objectBoundingBox units centre each gradient on its own face, so the
      // ellipses follow the face's isometric squash. Each face is drawn alone.
      const { color, shade } = mark.dusting;
      const radial = (id: string, cx: number, cy: number, r: number, paint: string, stops: [number, number][]) =>
        `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([offset, alpha]) => `<stop offset="${offset}" stop-color="${paint}" stop-opacity="${alpha}"/>`).join('')}</radialGradient>`;
      defs.push(
        radial('dust-haze', 0.5, 0.5, 0.48, color, [[0, 0.32], [0.6, 0.14], [1, 0]]),
        radial('dust-shade', 0.53, 0.58, 0.3, shade, [[0, 0.5], [0.55, 0.3], [1, 0]]),
        radial('dust-pile', 0.49, 0.47, 0.27, color, [[0, 1], [0.5, 0.9], [0.8, 0.45], [1, 0]]),
      );
      dusting = holes.split(/(?=M)/).map((face) => ['dust-haze', 'dust-shade', 'dust-pile']
        .map((id) => `<path d="${face}" fill="url(#${id})"/>`).join('')).join('');
    }
    const toppings = mark.toppings
      ? mark.toppings.dots.map(([cx, cy, r]) => {
        const shine = mark.toppings?.shine
          ? `<circle cx="${round(cx - r * 0.35)}" cy="${round(cy - r * 0.35)}" r="${round(r * 0.3)}" fill="${mark.toppings.shine}"/>`
          : '';
        return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${mark.toppings?.color}"/>${shine}`;
      }).join('')
      : '';
    const sprouts = mark.sprouts ? renderSprouts(mark.sprouts) : '';
    body = `${inner}${dusting}<path d="${source.path}" fill-rule="evenodd" fill="${fill.ref}"${opacity}${strokeAttrs}/>${toppings}${sprouts}`;
  }

  const group = `<g transform="translate(${tx} ${ty}) scale(${round(scale)})">${body}</g>`;

  if (!mark.glow) {
    return group;
  }

  defs.push(`<filter id="mark-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${round(plate.size * 0.03)}"/></filter>`);
  const glowGroup = group
    .replace(/fill="(?!none")[^"]*"/g, `fill="${mark.glow}"`)
    .replace(/fill-opacity="[^"]*"/g, '')
    .replace(/stroke="url\([^)]*\)"/g, `stroke="${mark.glow}"`);
  const glowLayer = `<g filter="url(#mark-glow)" opacity="0.55">${glowGroup}</g>`;
  return glowLayer + group;
}

function renderDesign(design: AppIconDesign, shape: AppIconShape, clipId?: string) {
  const plate = PLATES[shape];
  const size = CANVAS - plate.inset * 2;
  const defs: string[] = [];
  const background = paintDef('plate-fill', design.background);
  defs.push(background.def);
  defs.push(`<clipPath id="plate-clip"><rect x="${plate.inset}" y="${plate.inset}" width="${size}" height="${size}" rx="${plate.radius}"/></clipPath>`);

  const plateRect = `<rect x="${plate.inset}" y="${plate.inset}" width="${size}" height="${size}" rx="${plate.radius}" fill="${background.ref}"/>`;
  const decorations = renderDecorations(design.decorations ?? [], { x: plate.inset, size, radius: plate.radius });
  const mark = renderMark(design.mark, { x: plate.inset, size }, defs);
  const content = `<g clip-path="url(#plate-clip)">${plateRect}${decorations}${mark}</g>`;

  return {
    defs: defs.filter(Boolean),
    body: clipId ? `<g clip-path="url(#${clipId})">${content}</g>` : content,
  };
}

function wrapSvg(defs: string[], body: string, shape: AppIconShape) {
  const plate = PLATES[shape];
  const size = CANVAS - plate.inset * 2;
  const shadowDefs = plate.shadow
    ? '<filter id="plate-shadow" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000000" flood-opacity="0.3"/></filter>'
    : '';
  const shadow = plate.shadow
    ? `<rect x="${plate.inset}" y="${plate.inset}" width="${size}" height="${size}" rx="${plate.radius}" fill="#000000" filter="url(#plate-shadow)"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}"><defs>${shadowDefs}${defs.join('')}</defs>${shadow}${body}</svg>`;
}

function prefixIds(svgFragment: { defs: string[]; body: string }, prefix: string) {
  const rename = (value: string) => value
    .replace(/id="([^"]+)"/g, `id="${prefix}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}-$1)`);
  return { defs: svgFragment.defs.map(rename), body: rename(svgFragment.body) };
}

/** Renders a 1024×1024 SVG for an icon option. `system` renders a light/dark split preview. */
export function renderAppIconSvg(id: AppIconId, shape: AppIconShape = 'macos') {
  if (id !== 'system') {
    const { defs, body } = renderDesign(DESIGNS[id], shape);
    return wrapSvg(defs, body, shape);
  }

  const halfClips = [
    `<clipPath id="half-light"><polygon points="0,0 ${CANVAS},0 0,${CANVAS}"/></clipPath>`,
    `<clipPath id="half-dark"><polygon points="${CANVAS},0 ${CANVAS},${CANVAS} 0,${CANVAS}"/></clipPath>`,
  ];
  const light = prefixIds(renderDesign(DESIGNS['color-light'], shape, 'half-light'), 'l');
  const dark = prefixIds(renderDesign(DESIGNS['color-dark'], shape, 'half-dark'), 'd');
  // prefixIds also renamed the half-clip references; restore them to the shared ids.
  const restore = (body: string) => body.replace(/url\(#[ld]-(half-(?:light|dark))\)/g, 'url(#$1)');

  return wrapSvg(
    [...halfClips, ...light.defs, ...dark.defs],
    restore(light.body) + restore(dark.body),
    shape,
  );
}

/** Monochrome macOS menu bar template: black mark on transparent, alpha only. */
export function renderTrayTemplateSvg(size: number) {
  const { width, height, path } = MARKS.double;
  const scale = (size * 0.9) / Math.max(width, height);
  const tx = round((size - width * scale) / 2);
  const ty = round((size - height * scale) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><path transform="translate(${tx} ${ty}) scale(${round(scale * 1000) / 1000})" d="${path}" fill-rule="evenodd" fill="#000000"/></svg>`;
}

export function getAppIconDataUri(id: AppIconId, shape: AppIconShape = 'macos') {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderAppIconSvg(id, shape))}`;
}
