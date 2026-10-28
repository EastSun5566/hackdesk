import { parse as parseYaml } from 'yaml';

import { splitFrontMatter } from './front-matter';

/**
 * A HackMD slide deck is a note split into slides by `---` lines and into vertical slides by
 * `----` lines, each with a blank line before and after. Speaker notes start at a `note:` line,
 * and the front matter's `slideOptions` configure reveal.js.
 */
export type Slide = { content: string; notes: string };

export type SlideDeck = {
  title: string | null;
  theme: SlideTheme;
  /** reveal.js options: the defaults, then the note's own `slideOptions`. */
  options: Record<string, unknown>;
  lang: string | null;
  rtl: boolean;
  /** A single newline is a line break, unless the front matter says `breaks: false`. */
  breaks: boolean;
  /** Horizontal slides, each with the vertical slides below it. */
  stacks: Slide[][];
};

export const SLIDE_THEMES = [
  'black', 'white', 'league', 'beige', 'sky', 'night', 'serif', 'simple',
  'solarized', 'blood', 'moon', 'dracula', 'black-contrast', 'white-contrast',
] as const;

export type SlideTheme = typeof SLIDE_THEMES[number];

export const DEFAULT_SLIDE_OPTIONS: Record<string, unknown> = {
  controls: true,
  progress: true,
  slideNumber: true,
  center: true,
  transition: 'none',
  hash: false,
};

// Options that would load scripts, which a note may not do.
const BLOCKED_OPTIONS = ['dependencies', 'plugins'];

export function parseSlides(markdown: string): SlideDeck {
  const { yaml, body } = splitFrontMatter(markdown);
  const meta = asObject(readYaml(yaml));
  const slideOptions = asObject(typeof meta.slideOptions === 'string' ? readYaml(meta.slideOptions) : meta.slideOptions);
  const { theme, ...options } = { ...DEFAULT_SLIDE_OPTIONS, ...slideOptions };
  for (const key of BLOCKED_OPTIONS) delete options[key];

  const rtl = meta.dir === 'rtl';
  return {
    title: typeof meta.title === 'string' && meta.title.trim() ? meta.title.trim() : /^# +(.+)$/m.exec(body)?.[1]?.trim() ?? null,
    theme: SLIDE_THEMES.find(name => name === theme) ?? 'black',
    options: { ...options, rtl },
    lang: typeof meta.lang === 'string' ? meta.lang : null,
    rtl,
    breaks: meta.breaks !== false,
    stacks: splitSlides(body).map(stack => stack.map(splitNotes)),
  };
}

/** Whether the note's front matter says `type: slide`. */
export function hasSlideType(markdown: string) {
  if (!markdown.startsWith('---')) return false;
  const { yaml } = splitFrontMatter(markdown);
  return yaml !== null && /^type:\s*["']?slide["']?\s*$/m.test(yaml);
}

function splitSlides(body: string): string[][] {
  const lines = body.split('\n');
  const stacks: string[][][] = [[[]]];
  lines.forEach((line, index) => {
    const isBreak = (line === '---' || line === '----')
      && lines[index - 1] === ''
      && (index === lines.length - 1 || lines[index + 1] === '');
    if (!isBreak) {
      stacks.at(-1)!.at(-1)!.push(line);
    } else if (line === '---') {
      stacks.push([[]]);
    } else {
      stacks.at(-1)!.push([]);
    }
  });
  return stacks.map(stack => stack.map(slide => slide.join('\n').trim()));
}

/** Everything from the first `note:` line outside code and `:::` blocks is speaker notes. */
function splitNotes(slide: string): Slide {
  const lines = slide.split('\n');
  let fence: string | null = null;
  let containers = 0;
  for (const [index, line] of lines.entries()) {
    const fenceMark = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (fenceMark?.startsWith(fence)) fence = null;
      continue;
    }
    if (fenceMark) {
      fence = fenceMark;
    } else if (/^\s*:::\s*\S/.test(line)) {
      containers += 1;
    } else if (/^\s*:::\s*$/.test(line)) {
      containers = Math.max(0, containers - 1);
    } else if (containers === 0 && /^note:/i.test(line)) {
      return {
        content: lines.slice(0, index).join('\n').trim(),
        notes: [line.slice('note:'.length), ...lines.slice(index + 1)].join('\n').trim(),
      };
    }
  }
  return { content: slide, notes: '' };
}

function readYaml(text: string | null | undefined): unknown {
  if (!text) return null;
  try {
    return parseYaml(text);
  } catch {
    return null;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
