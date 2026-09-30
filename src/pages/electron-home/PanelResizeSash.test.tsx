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
});
