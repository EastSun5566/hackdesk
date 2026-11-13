/**
 * How much of the desktop shows through the window frame and sidebar (macOS). Each level is a
 * different vibrancy material: they differ far more in how much they let through than any CSS tint
 * over one material could, since a tint over the material only dilutes it.
 */
export const WINDOW_TRANSLUCENCY_LEVELS = ['off', 'subtle', 'medium', 'clear'] as const;
export type WindowTranslucency = (typeof WINDOW_TRANSLUCENCY_LEVELS)[number];

export function isWindowTranslucency(value: unknown): value is WindowTranslucency {
  return typeof value === 'string' && (WINDOW_TRANSLUCENCY_LEVELS as readonly string[]).includes(value);
}

/** The material behind each level: Subtle is the native sidebar (as in Finder), Clear the most see-through. */
export const WINDOW_TRANSLUCENCY_MATERIALS = {
  subtle: 'sidebar',
  medium: 'menu',
  clear: 'fullscreen-ui',
} as const satisfies Record<Exclude<WindowTranslucency, 'off'>, string>;
