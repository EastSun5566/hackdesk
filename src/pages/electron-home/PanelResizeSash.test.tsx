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

  it('grows a left-anchored panel when dragged or arrow-keyed left', () => {
    const onChange = vi.fn();
    render(
      <PanelResizeSash label="Resize inspector" value={320} min={260} max={560} direction="left" edge onChange={onChange} />,
    );
    const sash = screen.getByRole('button', { name: /Resize inspector/ });
    expect(sash).toHaveAttribute('data-edge-side', 'left');

    fireEvent.keyDown(sash, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith(336);
    fireEvent.keyDown(sash, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(304);

    fireEvent.pointerDown(sash, { clientX: 400, pointerId: 2 });
    fireEvent.pointerMove(sash, { clientX: 350, buttons: 1, pointerId: 2 });
    expect(onChange).toHaveBeenLastCalledWith(370);
    fireEvent.pointerUp(sash, { pointerId: 2 });
  });

  it('triggers onCollapse when dragged past collapseThreshold without persisting min width', () => {
    const onChange = vi.fn();
    const onCollapse = vi.fn();
    const panel = document.createElement('div');
    panel.id = 'collapse-target';
    document.body.append(panel);
    HTMLElement.prototype.setPointerCapture ??= () => {};
    render(
      <PanelResizeSash
        label="Resize navigator"
        value={260}
        min={220}
        max={680}
        collapseThreshold={130}
        onCollapse={onCollapse}
        onChange={onChange}
        previewTargetId="collapse-target"
        previewProperties={['--panel-width']}
      />,
    );
    const sash = screen.getByRole('button', { name: /Resize navigator/ });

    fireEvent.pointerDown(sash, { clientX: 300, pointerId: 3 });
    fireEvent.pointerMove(sash, { clientX: 150, buttons: 1, pointerId: 3 });
    expect(sash).toHaveAttribute('data-collapse-ready', 'true');
    expect(panel.style.getPropertyValue('--panel-width')).toBe('220px');

    fireEvent.pointerUp(sash, { pointerId: 3 });
    expect(onCollapse).toHaveBeenCalledOnce();
    expect(onChange).not.toHaveBeenCalled();
    expect(panel.style.getPropertyValue('--panel-width')).toBe('260px');
    expect(document.documentElement.dataset.panelResizing).toBeUndefined();
    panel.remove();
  });
});
