import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Check, ChevronDown, Copy, Inbox, X } from 'lucide-react';
import {
  listDrafts,
  updateDraftStatus,
  type FormatId,
  type GeneratedContentDto,
  type GeneratedContentSource,
  type GeneratedContentStatus,
} from '@/lib/api/content';
import { useTeamId } from '@/lib/useTeamId';
import { useTour } from '@/context/tour-context';
import { PAGE_TOURS } from '@/lib/tours';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageHelp } from '@/components/dashboard/PageHelp';

const STATUS_FILTERS: { value: GeneratedContentStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'dismissed', label: 'Dismissed' },
];

const SOURCE_FILTERS: { value: GeneratedContentSource | 'all'; label: string }[] = [
  { value: 'all', label: 'All sources' },
  { value: 'auto', label: 'Auto' },
  { value: 'manual', label: 'Manual' },
];

const FORMAT_LABELS: Record<FormatId, string> = {
  facebook_post: 'Facebook post',
  linkedin_post: 'LinkedIn post',
  facebook_reel_script: 'Facebook Reel script',
  caption: 'Caption',
  youtube_idea: 'YouTube video idea',
};

const STATUS_CHIP: Record<GeneratedContentStatus, string> = {
  draft: 'border-amber-400/40 bg-amber-400/10 text-amber-400',
  approved: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400',
  dismissed: 'border-white/10 bg-white/5 text-muted-foreground',
};

const previewText = (value: string | { title: string }): string =>
  typeof value === 'string' ? value : `${value.title} (YouTube idea)`;

function DraftRow({ draft }: { draft: GeneratedContentDto }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const statusMutation = useMutation({
    mutationFn: (status: 'approved' | 'dismissed') => updateDraftStatus(draft._id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update status'),
  });

  const copyFormat = async (value: string | { title: string }) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    await navigator.clipboard.writeText(text);
    toast.success('Copied');
  };

  const formatEntries = Object.entries(draft.formats) as [FormatId, string | { title: string }][];

  return (
    <div className="glass-card flex flex-col gap-3 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="font-medium text-foreground">{draft.topic}</p>
          <div className="flex items-center gap-2 text-xs">
            <span className={cn('rounded-full border px-2 py-0.5 capitalize', STATUS_CHIP[draft.status])}>
              {draft.status}
            </span>
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-muted-foreground capitalize">
              {draft.source}
            </span>
            <span className="text-muted-foreground">{new Date(draft.created_at).toLocaleDateString()}</span>
            {draft.created_by_name && (
              <span className="text-muted-foreground">by {draft.created_by_name}</span>
            )}
            {draft.updated_by_name && draft.status !== 'draft' && (
              <span className="text-muted-foreground">
                · {draft.status} by {draft.updated_by_name}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={draft.status === 'approved' || statusMutation.isPending}
            onClick={() => statusMutation.mutate('approved')}
            className="gap-1.5"
          >
            <Check className="size-3.5" /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={draft.status === 'dismissed' || statusMutation.isPending}
            onClick={() => statusMutation.mutate('dismissed')}
            className="gap-1.5"
          >
            <X className="size-3.5" /> Dismiss
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
            <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
          {formatEntries.map(([format, value]) => (
            <div key={format} className="flex items-start justify-between gap-2 rounded-lg bg-white/5 p-3">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{FORMAT_LABELS[format]}</p>
                <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{previewText(value)}</p>
              </div>
              <Button size="icon-sm" variant="ghost" onClick={() => copyFormat(value)}>
                <Copy className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Drafts() {
  const teamId = useTeamId();
  const { startTour } = useTour();
  const [status, setStatus] = useState<GeneratedContentStatus | 'all'>('all');
  const [source, setSource] = useState<GeneratedContentSource | 'all'>('all');

  const query = useQuery({
    queryKey: ['drafts', { teamId, status, source }],
    queryFn: () =>
      listDrafts({
        team_id: teamId as string,
        status: status === 'all' ? undefined : status,
        source: source === 'all' ? undefined : source,
      }),
    enabled: Boolean(teamId),
  });

  if (!teamId) {
    return (
      <div className="glass-card flex flex-col items-center gap-2 rounded-xl p-8 text-center">
        <h1 className="text-lg font-semibold">Drafts</h1>
        <p className="text-sm text-muted-foreground">You need to belong to a team to see drafts.</p>
      </div>
    );
  }

  const drafts = query.data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Drafts</h1>
        <PageHelp guideKey="drafts" onStartTour={() => startTour(PAGE_TOURS.drafts)} />
      </div>

      <div data-tour="drafts-filters" className="glass-card flex flex-wrap items-center gap-4 rounded-xl p-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatus(option.value)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition',
                status === option.value
                  ? 'border-violet-400/50 bg-violet-400/15 text-violet-200'
                  : 'border-white/10 text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as GeneratedContentSource | 'all')}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {SOURCE_FILTERS.map((option) => (
            <option key={option.value} value={option.value} className="bg-background text-foreground">
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div data-tour="drafts-list">
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : query.isError ? (
          <div className="glass-card flex flex-col items-center gap-2 rounded-xl p-8 text-center">
            <AlertTriangle className="size-6 text-red-400" />
            <p className="text-sm text-muted-foreground">Couldn't load drafts.</p>
          </div>
        ) : drafts.length === 0 ? (
          <div className="glass-card flex flex-col items-center gap-2 rounded-xl p-8 text-center">
            <Inbox className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No drafts yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {drafts.map((draft) => (
              <DraftRow key={draft._id} draft={draft} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
