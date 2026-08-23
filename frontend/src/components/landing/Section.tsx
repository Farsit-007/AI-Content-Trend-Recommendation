import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  id?: string;
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  /** Center the heading block. */
  centered?: boolean;
  className?: string;
  /** Constrain inner content width. Defaults to max-w-7xl (1280px). */
  containerClassName?: string;
  children?: ReactNode;
}

/**
 * Standardized marketing section: consistent vertical rhythm, centered
 * container, and an optional eyebrow/title/description heading block.
 */
export function Section({
  id,
  eyebrow,
  title,
  description,
  centered = false,
  className,
  containerClassName,
  children,
}: SectionProps) {
  return (
    <section id={id} className={cn('relative py-20 sm:py-24', className)}>
      <div
        className={cn(
          'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8',
          containerClassName,
        )}
      >
        {(eyebrow || title || description) && (
          <div
            className={cn(
              'mb-12 max-w-2xl',
              centered && 'mx-auto text-center',
            )}
          >
            {eyebrow && (
              <div
                className={cn(
                  'glass-card mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-brand',
                )}
              >
                {eyebrow}
              </div>
            )}
            {title && (
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-muted-foreground mt-4 text-lg">{description}</p>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
