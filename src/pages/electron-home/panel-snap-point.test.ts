import { afterEach, describe, expect, it } from 'vitest';

import type { PanelSnapMemory } from './panel-snap-point';
import { readSnapMemory, recordSnapSample, snapWidth, writeSnapMemory } from './panel-snap-point';

function record(widths: number[], memory: PanelSnapMemory = { samples: [], point: null }) {
  return widths.reduce(recordSnapSample, memory);
}

describe('panel snap point', () => {
  afterEach(() => window.localStorage.clear());

  it('shows no snap point until about three recent drags agree', () => {
    expect(record([360, 361]).point).toBeNull();
    expect(record([360, 361, 359]).point).not.toBeNull();
  });

  it('lets nearby widths stack into one hill', () => {
    expect(record([358, 362, 360]).point).toBe(360);
  });

  it('shows no snap point for scattered drags', () => {
    expect(record([300, 340, 380, 420, 460, 500]).point).toBeNull();
    // Three agreeing drags long ago have decayed below the threshold.
    expect(record([360, 360, 360, 300, 330, 400, 430, 460, 490, 520, 550]).point).toBeNull();
  });

  it('weights recent drags more, so a new habit takes over', () => {
    const old = record(Array.from({ length: 10 }, () => 360));
    expect(record([450, 450, 450], old).point).toBe(360);
    expect(record(Array.from({ length: 8 }, () => 450), old).point).toBe(450);
  });

  it('keeps the snap point while the peak moves within the snap zone', () => {
    const learned = record([360, 360, 360]);
    expect(record([366, 366, 366, 366, 366, 366], learned).point).toBe(360);
    expect(record([380, 380, 380, 380, 380, 380], learned).point).toBe(380);
  });

  it('snaps widths within the zone only', () => {
    expect(snapWidth(352, 360)).toBe(360);
    expect(snapWidth(370, 360)).toBe(360);
    expect(snapWidth(371, 360)).toBe(371);
    expect(snapWidth(352, null)).toBe(352);
  });

  it('round-trips through storage and ignores malformed data', () => {
    const memory = record([360, 360, 360]);
    writeSnapMemory('snap', memory);
    expect(readSnapMemory('snap')).toEqual(memory);

    window.localStorage.setItem('snap', '{"samples":[300,"x",null],"point":"360"}');
    expect(readSnapMemory('snap')).toEqual({ samples: [300], point: null });
    window.localStorage.setItem('snap', 'not json');
    expect(readSnapMemory('snap')).toEqual({ samples: [], point: null });
  });
});
