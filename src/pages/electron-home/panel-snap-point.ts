import { trySetStorageItem } from '@/lib/storage';

/**
 * A resizable panel learns the width it keeps being dragged to and snaps to it.
 *
 * Every drag that ends records its width as a sample. Samples stack into hills (a triangular
 * kernel SNAP_ZONE px wide), and a sample's weight halves every SAMPLE_HALF_LIFE drags, so recent
 * drags count more. The snap point is the peak of the tallest hill, once recent drags agree on it
 * (SNAP_MIN_SUPPORT), and it stays put while the peak moves within the snap zone.
 */
export type PanelSnapMemory = {
  /** Drag-end widths, oldest first. */
  samples: number[];
  point: number | null;
};

/** A drag within this many px of the snap point sticks to it. */
export const SNAP_ZONE = 10;
/** Holding the pointer still this long while snapped lets the edge follow the pointer again. */
export const SNAP_RELEASE_DELAY_MS = 400;

const SAMPLE_HALF_LIFE = 5;
// About three recent drags (weights 1 + 0.87 + 0.76) must agree before a snap point shows.
const SNAP_MIN_SUPPORT = 2.25;
// Weight halves every 5 drags, so a sample 60 drags old counts for 1/4096: drop it.
const MAX_SAMPLES = 60;

const EMPTY_MEMORY: PanelSnapMemory = { samples: [], point: null };

function sampleWeight(age: number) {
  return 0.5 ** (age / SAMPLE_HALF_LIFE);
}

function findSnapPoint(samples: readonly number[], previous: number | null) {
  const weights = samples.map((_, index) => sampleWeight(samples.length - 1 - index));
  // A sum of triangular kernels peaks at one of the samples, so only those need checking.
  let peak: number | undefined;
  let peakHeight = 0;
  for (const candidate of samples) {
    let height = 0;
    samples.forEach((sample, index) => {
      height += weights[index] * Math.max(0, 1 - Math.abs(candidate - sample) / SNAP_ZONE);
    });
    // `>=` lets the newer of two equal hills win.
    if (height >= peakHeight) {
      peak = candidate;
      peakHeight = height;
    }
  }
  if (peak === undefined) return null;
  const point = peak;

  let support = 0;
  samples.forEach((sample, index) => {
    if (Math.abs(sample - point) <= SNAP_ZONE) support += weights[index];
  });
  if (support < SNAP_MIN_SUPPORT) return null;
  // Don't drift pixel by pixel: keep the old point while the peak stays within its zone.
  return previous !== null && Math.abs(point - previous) <= SNAP_ZONE ? previous : point;
}

export function recordSnapSample(memory: PanelSnapMemory, width: number): PanelSnapMemory {
  const samples = [...memory.samples, Math.round(width)].slice(-MAX_SAMPLES);
  return { samples, point: findSnapPoint(samples, memory.point) };
}

/** The width a drag shows: the snap point while the pointer is within its zone. */
export function snapWidth(width: number, point: number | null) {
  return point !== null && Math.abs(width - point) <= SNAP_ZONE ? point : width;
}

export function readSnapMemory(key: string): PanelSnapMemory {
  if (typeof window === 'undefined') return EMPTY_MEMORY;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? 'null') as Partial<PanelSnapMemory> | null;
    const samples = Array.isArray(value?.samples)
      ? value.samples.filter((sample): sample is number => typeof sample === 'number' && Number.isFinite(sample))
      : [];
    const point = typeof value?.point === 'number' && Number.isFinite(value.point) ? value.point : null;
    return { samples: samples.slice(-MAX_SAMPLES), point };
  } catch {
    return EMPTY_MEMORY;
  }
}

export function writeSnapMemory(key: string, memory: PanelSnapMemory) {
  if (typeof window !== 'undefined') {
    trySetStorageItem(window.localStorage, key, JSON.stringify(memory));
  }
}
