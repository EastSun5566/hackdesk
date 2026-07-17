import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
