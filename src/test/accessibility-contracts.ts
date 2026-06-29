import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, type Mock } from 'vitest';

export async function expectToolbarRovingFocus(toolbarName: string, buttonNames: [string, ...string[]]) {
  const toolbar = screen.getByRole('toolbar', { name: toolbarName });
  const buttons = buttonNames.map((name) => screen.getByRole('button', { name }));

  expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
  expect(buttons[0]).toHaveAttribute('tabindex', '0');
  for (const button of buttons.slice(1)) {
    expect(button).toHaveAttribute('tabindex', '-1');
  }

  buttons[0].focus();

  if (buttons.length === 1) {
    expect(buttons[0]).toHaveFocus();
    return;
  }

  fireEvent.keyDown(buttons[0], { key: 'ArrowRight' });
  await waitFor(() => expect(buttons[1]).toHaveFocus());

  fireEvent.keyDown(buttons[1], { key: 'ArrowLeft' });
  await waitFor(() => expect(buttons[0]).toHaveFocus());

  fireEvent.keyDown(buttons[0], { key: 'ArrowLeft' });
  await waitFor(() => expect(buttons.at(-1)).toHaveFocus());
}

export function expectDisabledToolbarAction(button: HTMLElement, onClick: Mock) {
  expect(button).toHaveAttribute('aria-disabled', 'true');
  expect(button).toHaveAttribute('data-focusable');
  expect(button).toHaveClass('focus-visible:ring-2');

  button.focus();
  fireEvent.click(button);

  expect(button).toHaveFocus();
  expect(onClick).not.toHaveBeenCalled();
}

export async function expectMenuReturnsFocus(
  trigger: HTMLElement,
  closeMenu: (menu: HTMLElement) => void | Promise<void>,
) {
  trigger.focus();
  fireEvent.pointerDown(trigger);

  const menu = await screen.findByRole('menu');
  await closeMenu(menu);

  await waitFor(() => expect(trigger).toHaveFocus());
  expect(document.body).not.toHaveFocus();
}
