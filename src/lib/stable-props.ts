import { useMemo, useRef } from 'react';

type AnyFunction = (...args: never[]) => unknown;

/**
 * The same object with every function field replaced by a wrapper that keeps one identity and
 * always calls the latest function. Parents rebuild callback objects on each render; passing them
 * through this lets a memoized child skip renders without ever calling a stale callback.
 */
export function useStableCallbacks<T extends object>(value: T): T {
  return { ...value, ...useCallbackWrappers(value) };
}

/**
 * For an object holding only callbacks: one object of stable wrappers, which keeps its identity
 * while the same callbacks are present. An absent (undefined) callback stays absent, so a consumer
 * can still check whether it is offered.
 */
export function useStableCallbackObject<T extends { [K in keyof T]?: AnyFunction }>(value: T): T {
  return useCallbackWrappers(value) as T;
}

function useCallbackWrappers(value: object): Record<string, AnyFunction> {
  const latest = useRef(value);
  latest.current = value;
  const wrappers = useRef(new Map<string, AnyFunction>());

  const keys = Object.keys(value).filter((key) => typeof (value as Record<string, unknown>)[key] === 'function').join('\0');
  return useMemo(() => {
    const result: Record<string, AnyFunction> = {};
    for (const key of keys ? keys.split('\0') : []) {
      let wrapper = wrappers.current.get(key);
      if (!wrapper) {
        wrapper = ((...args: never[]) => (latest.current as Record<string, AnyFunction>)[key]?.(...args)) as AnyFunction;
        wrappers.current.set(key, wrapper);
      }
      result[key] = wrapper;
    }
    return result;
  }, [keys]);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Props equality for a memoized panel: top-level props match by identity, or, for plain objects
 * rebuilt each render (`selection`, `status`, ...), field by field. Functions must already be
 * stable (see useStableCallbacks).
 */
export function arePanelPropsEqual<T extends object>(previous: T, next: T) {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    const a = (previous as Record<string, unknown>)[key];
    const b = (next as Record<string, unknown>)[key];
    if (Object.is(a, b)) continue;
    if (!isPlainObject(a) || !isPlainObject(b)) return false;
    const fields = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const field of fields) {
      if (!Object.is(a[field], b[field])) return false;
    }
  }
  return true;
}
