import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PanelResizeSash } from './PanelResizeSash';

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
});
