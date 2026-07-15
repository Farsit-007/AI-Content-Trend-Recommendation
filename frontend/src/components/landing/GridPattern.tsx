import { cn } from '@/lib/utils';

interface GridPatternProps {
  /** Use a dot grid instead of line grid. */
  variant?: 'grid' | 'dot';
  className?: string;
}

/**
 * Crafted grid/dot background layer. Absolutely positioned, radial-masked to
 * fade toward the edges, and non-interactive so it never blocks clicks.
 */
export function GridPattern({ variant = 'grid', className }: GridPatternProps) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 -z-10',
        variant === 'dot' ? 'dot-pattern' : 'grid-pattern',
        className,
      )}
    />
  );
}
