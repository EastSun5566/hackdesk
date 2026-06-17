import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MarkdownReader } from './MarkdownReader';

describe('MarkdownReader', () => {
  it('renders sanitized markdown content', () => {
    render(<MarkdownReader value={'# Hello\n\n<script>alert(1)</script>\n\n[Link](https://example.com)'} onOpenExternal={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /hello/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Link' })).toHaveAttribute('href', 'https://example.com');
    expect(screen.getByTestId('markdown-reader').innerHTML).not.toContain('<script');
  });

  it('opens reader links through the provided external opener', () => {
    const onOpenExternal = vi.fn();
    render(<MarkdownReader value="[HackMD](https://hackmd.io)" onOpenExternal={onOpenExternal} />);

    fireEvent.click(screen.getByRole('link', { name: 'HackMD' }));

    expect(onOpenExternal).toHaveBeenCalledWith('https://hackmd.io/');
  });

  it('renders a quiet empty state for blank content', () => {
    render(<MarkdownReader value="   " onOpenExternal={vi.fn()} />);

    expect(screen.getByText('Nothing to read yet.')).toBeInTheDocument();
  });
});
