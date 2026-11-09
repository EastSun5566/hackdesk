import { fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { installInputModality } from './input-modality';

describe('input modality', () => {
  let uninstall: (() => void) | undefined;
  afterEach(() => uninstall?.());

  it('follows the last pointer press or key press', () => {
    uninstall = installInputModality();
    const root = document.documentElement;
    expect(root.dataset.inputModality).toBeUndefined();

    fireEvent.pointerDown(document.body);
    expect(root.dataset.inputModality).toBe('pointer');

    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(root.dataset.inputModality).toBe('keyboard');
  });

  it('ignores a modifier held on its own', () => {
    uninstall = installInputModality();
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document.body, { key: 'Meta' });
    expect(document.documentElement.dataset.inputModality).toBe('pointer');
  });
});
