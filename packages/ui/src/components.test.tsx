import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { KeyCap } from './KeyCap';
import { Surface } from './Surface';
import { TooltipProvider } from './Tooltip';

const withTooltips = ({ children }: { children: ReactNode }) => <TooltipProvider delayDuration={0}>{children}</TooltipProvider>;

describe('KeyCap', () => {
  it('shows glyphs and gives screen readers the words', () => {
    render(<KeyCap keys={['mod', 'k']} platform="mac" />);
    const cap = screen.getByText('⌘K').closest('kbd')!;
    expect(cap).toHaveTextContent('Command K');
    expect(screen.getByText('⌘K')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Button', () => {
  it('is type=button by default, so it never submits a form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('uses the coral primary colour only for the primary variant', () => {
    render(
      <>
        <Button variant="primary">Share</Button>
        <Button variant="ghost">Cancel</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Share' }).className).toContain('bg-primary');
    expect(screen.getByRole('button', { name: 'Cancel' }).className).not.toContain('bg-primary');
  });

  it('calls onClick, and not when disabled', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Pin step</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<Button onClick={onClick} disabled>Pin step</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows a shortcut', () => {
    render(<Button shortcut={['shift', 'p']}>Pin step</Button>);
    expect(screen.getByRole('button')).toHaveTextContent(/Pin step.*Shift P/);
  });
});

describe('IconButton', () => {
  it('takes its accessible name from the label and exposes the shortcut', () => {
    render(<IconButton label="Undo" icon={<svg />} shortcut={['mod', 'z']} />, { wrapper: withTooltips });
    const button = screen.getByRole('button', { name: 'Undo' });
    expect(button).toHaveAttribute('aria-keyshortcuts');
    expect(button).not.toHaveAttribute('aria-pressed');
  });

  it('reports pressed state for toggles', () => {
    render(<IconButton label="Snapping" icon={<svg />} pressed />, { wrapper: withTooltips });
    expect(screen.getByRole('button', { name: 'Snapping' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows its tooltip on keyboard focus', async () => {
    render(<IconButton label="Search actions" icon={<svg />} shortcut={['mod', 'k']} />, { wrapper: withTooltips });
    await act(async () => {
      screen.getByRole('button').focus();
    });
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Search actions');
  });
});

describe('Surface', () => {
  it('renders the requested element with the variant styling', () => {
    render(<Surface as="aside" variant="floating" aria-label="Tools" />);
    const el = screen.getByRole('complementary', { name: 'Tools' });
    expect(el.className).toContain('backdrop-blur');
  });
});
