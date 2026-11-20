import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readSnapMemory, SNAP_RELEASE_DELAY_MS, writeSnapMemory } from './panel-snap-point';
import { PanelResizeSash } from './PanelResizeSash';

function renderSnappingSash(onChange = vi.fn()) {
  const panel = document.createElement('div');
  panel.id = 'snap-target';
  document.body.append(panel);
  HTMLElement.prototype.setPointerCapture ??= () => {};
  render(
    <PanelResizeSash
      label="Resize navigator"
      value={300}
      min={280}
      max={480}
      onChange={onChange}
      previewTargetId="snap-target"
      previewProperties={['--panel-width']}
      snapMemoryKey="snap"
    />,
  );
  return {
    onChange,
    panel,
    sash: screen.getByRole('button', { name: /Resize navigator/ }),
    width: () => panel.style.getPropertyValue('--panel-width'),
  };
}

describe('PanelResizeSash', () => {
  it('resizes with the keyboard, clamps to limits and resets', () => {
    const onChange = vi.fn();
    render(<PanelResizeSash label="Resize navigator" value={300} min={280} max={400} defaultValue={320} onChange={onChange} />);
    const sash = screen.getByRole('button', { name: /Resize navigator/ });
    fireEvent.keyDown(sash, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(316);
    fireEvent.keyDown(sash, { key: 'ArrowLeft', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(280);
    fireEvent.keyDown(sash, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith(400);
    fireEvent.keyDown(sash, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(320);
    fireEvent.doubleClick(sash);
    expect(onChange).toHaveBeenLastCalledWith(320);
  });

  it('commits a previewed drag that ends without pointerup', () => {
    const onChange = vi.fn();
    const panel = document.createElement('div');
    panel.id = 'resize-target';
    document.body.append(panel);
    HTMLElement.prototype.setPointerCapture ??= () => {};
    render(
      <PanelResizeSash label="Resize navigator" value={300} min={280} max={400} onChange={onChange} previewTargetId="resize-target" previewProperties={['--panel-width']} />,
    );
    const sash = screen.getByRole('button', { name: /Resize navigator/ });

    fireEvent.pointerDown(sash, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(sash, { clientX: 40, buttons: 1, pointerId: 1 });
    expect(panel.style.getPropertyValue('--panel-width')).toBe('340px');
    expect(onChange).not.toHaveBeenCalled();

    // A system gesture cancels the drag: no pointerup, only the capture is lost.
    fireEvent.lostPointerCapture(sash, { pointerId: 1 });
    expect(onChange).toHaveBeenCalledWith(340);
    panel.remove();
  });

  describe('snapping to the learned width', () => {
    afterEach(() => {
      vi.useRealTimers();
      window.localStorage.clear();
      document.getElementById('snap-target')?.remove();
    });

    it('sticks to the snap point within its zone and records the snapped width', () => {
      writeSnapMemory('snap', { samples: [360, 360, 360], point: 360 });
      const { onChange, sash, width } = renderSnappingSash();

      fireEvent.pointerDown(sash, { clientX: 0, pointerId: 1 });
      fireEvent.pointerMove(sash, { clientX: 45, buttons: 1, pointerId: 1 });
      expect(width()).toBe('345px');
      fireEvent.pointerMove(sash, { clientX: 52, buttons: 1, pointerId: 1 });
      expect(width()).toBe('360px');
      fireEvent.pointerMove(sash, { clientX: 68, buttons: 1, pointerId: 1 });
      expect(width()).toBe('360px');
      fireEvent.pointerUp(sash, { clientX: 68, pointerId: 1 });

      expect(onChange).toHaveBeenCalledWith(360);
      expect(readSnapMemory('snap').samples).toEqual([360, 360, 360, 360]);
    });

    it('lets go after a pause, without a jump, so nearby widths stay reachable', () => {
      vi.useFakeTimers();
      writeSnapMemory('snap', { samples: [360, 360, 360], point: 360 });
      const { onChange, sash, width } = renderSnappingSash();

      fireEvent.pointerDown(sash, { clientX: 0, pointerId: 1 });
      fireEvent.pointerMove(sash, { clientX: 55, buttons: 1, pointerId: 1 });
      expect(width()).toBe('360px');
      vi.advanceTimersByTime(SNAP_RELEASE_DELAY_MS);
      fireEvent.pointerMove(sash, { clientX: 59, buttons: 1, pointerId: 1 });
      expect(width()).toBe('364px');
      fireEvent.pointerUp(sash, { clientX: 59, pointerId: 1 });

      expect(onChange).toHaveBeenCalledWith(364);
    });

    it('keeps snapping while the pointer keeps moving', () => {
      vi.useFakeTimers();
      writeSnapMemory('snap', { samples: [360, 360, 360], point: 360 });
      const { sash, width } = renderSnappingSash();

      fireEvent.pointerDown(sash, { clientX: 0, pointerId: 1 });
      for (let x = 52; x <= 68; x += 2) {
        fireEvent.pointerMove(sash, { clientX: x, buttons: 1, pointerId: 1 });
        vi.advanceTimersByTime(SNAP_RELEASE_DELAY_MS / 2);
      }
      expect(width()).toBe('360px');
    });

    it('learns from drags, but not from clicks or the keyboard', () => {
      const { onChange, sash, width } = renderSnappingSash();
      const drag = (to: number) => {
        fireEvent.pointerDown(sash, { clientX: 0, pointerId: 1 });
        fireEvent.pointerMove(sash, { clientX: to, buttons: 1, pointerId: 1 });
        fireEvent.pointerUp(sash, { clientX: to, pointerId: 1 });
      };

      drag(60);
      drag(61);
      fireEvent.pointerDown(sash, { clientX: 0, pointerId: 1 });
      fireEvent.pointerUp(sash, { clientX: 0, pointerId: 1 });
      fireEvent.keyDown(sash, { key: 'ArrowRight' });
      expect(readSnapMemory('snap')).toEqual({ samples: [360, 361], point: null });

      drag(59);
      // The three drags stack into one hill, peaking at 360.
      expect(readSnapMemory('snap').point).toBe(360);
      onChange.mockClear();
      drag(66);
      expect(width()).toBe('360px');
      expect(onChange).toHaveBeenCalledWith(360);
    });
  });
});
