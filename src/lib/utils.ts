import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The theme's own text sizes. Without this, tailwind-merge reads `text-menu` as a colour and drops
// it (or the real colour) when both appear in one class list.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['2xs', 'menu'] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function debounce<Params extends unknown[]>(
  fn: (...args: Params) => unknown,
  timeout: number,
): (...args: Params) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Params) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, timeout);
  };
}
