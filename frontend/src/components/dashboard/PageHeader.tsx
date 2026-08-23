import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PageHelp } from '@/components/dashboard/PageHelp';
import type { PAGE_GUIDES } from '@/lib/pageGuides';

interface PageHeaderProps {
  /** The plain part of the heading. */
  title: string;
  /** Optional leading fragment styled with `.gradient-text`, e.g. accent="User" title="accounts". */
  accent?: string;
  description?: string;
  icon?: LucideIcon;
  guideKey?: keyof typeof PAGE_GUIDES;
  /** Primary/secondary actions, right-aligned next to the help button. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The one page-title row every dashboard page uses. Before this, each page hand-rolled its
 * own heading + description + PageHelp arrangement and they drifted apart by a few pixels
 * and a font weight each.
 */
export function PageHeader({
  title,
  accent,
  description,
  icon: Icon,
  guideKey,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-brand/25 bg-brand-surface">
            <Icon className="size-4.5 text-brand" />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">
            {accent && <span className="gradient-text">{accent} </span>}
            {title}
          </h1>
          {description && (
            <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {guideKey && <PageHelp guideKey={guideKey} />}
      </div>
    </div>
  );
}
