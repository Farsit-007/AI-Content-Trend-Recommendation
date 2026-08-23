import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Copy, Eye, Inbox, Loader2, MoreHorizontal, Sparkles, X } from 'lucide-react';

import {
  listDrafts,
  updateDraftStatus,
  type FormatId,
  type GeneratedContentDto,
  type GeneratedContentSource,
  type GeneratedContentStatus,
} from '@/lib/api/content';
import { useTeamId } from '@/lib/useTeamId';
import { timeAgo } from '@/lib/datetime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, selectionColumn, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/dashboard/PageHeader';

const ALL = 'all';

const STATUS_FILTERS: { value: GeneratedContentStatus | typeof ALL; label: string }[] = [
  { value: ALL, label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'dismissed', label: 'Dismissed' },
];

const SOURCE_FILTERS: { value: GeneratedContentSource | typeof ALL; label: string }[] = [
  { value: ALL, label: 'All sources' },
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

const STATUS_VARIANT: Record<GeneratedContentStatus, 'trend' | 'opportunity' | 'muted'> = {
  draft: 'trend',
  approved: 'opportunity',
  dismissed: 'muted',
};

const previewText = (value: string | { title: string }): string =>
  typeof value === 'string' ? value : value.title + ' (YouTube idea)';

const formatBody = (value: string | { title: string }): string =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2);

/** Read-and-copy view of one draft: every generated format, in full. */
function DraftPreviewDialog({
  draft,
  open,
  onOpenChange,
  onApprove,
  onDismiss,
  isPending,
}: {
  draft: GeneratedContentDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: () => void;
  onDismiss: () => void;
  isPending: boolean;
}) {
  const entries = draft
    ? (Object.entries(draft.formats) as [FormatId, string | { title: string }][])
    : [];

  const copy = async (value: string | { title: string }, label: string) => {
    try {
      await navigator.clipboard.writeText(formatBody(value));
      toast.success(label + ' copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-8">{draft?.topic}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            {draft && (
              <>
                <Badge variant={STATUS_VARIANT[draft.status]}>{draft.status}</Badge>
                <Badge variant="outline">{draft.source}</Badge>
                <span>{timeAgo(draft.created_at)}</span>
                {draft.created_by_name && <span>· by {draft.created_by_name}</span>}
                {draft.model_used && <span>· {draft.model_used}</span>}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto">
          {entries.map(([format, value]) => (
            <div key={format} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {FORMAT_LABELS[format] ?? format}
                </p>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={'Copy ' + (FORMAT_LABELS[format] ?? format)}
                  onClick={() => copy(value, FORMAT_LABELS[format] ?? format)}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
              <p className="text-sm break-words whitespace-pre-wrap text-foreground/90">
                {formatBody(value)}
              </p>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="gap-1.5"
            disabled={draft?.status === 'dismissed' || isPending}
            onClick={onDismiss}
          >
            <X className="size-3.5" />
            Dismiss
          </Button>
          <Button
            className="btn-glow gap-1.5"
            disabled={draft?.status === 'approved' || isPending}
            onClick={onApprove}
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Drafts() {
  const teamId = useTeamId();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<GeneratedContentStatus | typeof ALL>(ALL);
  const [source, setSource] = useState<GeneratedContentSource | typeof ALL>(ALL);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [previewing, setPreviewing] = useState<GeneratedContentDto | null>(null);

  // A filter change makes the current page number meaningless against the new result set.
  const changeStatus = (value: GeneratedContentStatus | typeof ALL) => {
    setStatus(value);
    setPage(1);
  };
  const changeSource = (value: GeneratedContentSource | typeof ALL) => {
    setSource(value);
    setPage(1);
  };
  const changePageSize = (value: number) => {
    setPageSize(value);
    setPage(1);
  };

  const query = useQuery({
    queryKey: ['drafts', { teamId, status, source, page, pageSize }],
    queryFn: () =>
      listDrafts({
        team_id: teamId as string,
        status: status === ALL ? undefined : status,
        source: source === ALL ? undefined : source,
        page,
        limit: pageSize,
      }),
    enabled: Boolean(teamId),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: 'approved' | 'dismissed' }) =>
      updateDraftStatus(id, next),
    onSuccess: (_result, { next }) => {
      toast.success(next === 'approved' ? 'Draft approved' : 'Draft dismissed');
      setPreviewing(null);
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update status'),
  });

  const bulkMutation = useMutation({
    mutationFn: async ({ ids, next }: { ids: string[]; next: 'approved' | 'dismissed' }) => {
      // No bulk endpoint exists, so this is a client-side fan-out. allSettled rather than all:
      // one rejected row must not hide the ones that succeeded.
      const results = await Promise.allSettled(ids.map((id) => updateDraftStatus(id, next)));
      return {
        succeeded: results.filter((result) => result.status === 'fulfilled').length,
        failed: results.filter((result) => result.status === 'rejected').length,
      };
    },
    onSuccess: ({ succeeded, failed }, { next }) => {
      if (succeeded > 0) {
        toast.success(succeeded + ' draft(s) ' + next);
      }
      if (failed > 0) {
        toast.error(failed + ' draft(s) could not be updated');
      }
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Bulk update failed'),
  });

  const drafts = query.data?.data ?? [];
  const total = query.data?.meta?.total ?? drafts.length;

  const columns = useMemo<DataTableColumn<GeneratedContentDto>[]>(
    () => [
      selectionColumn<GeneratedContentDto>(),
      {
        id: 'topic',
        accessorKey: 'topic',
        header: 'Topic',
        sortFn: 'text',
        cell: ({ row }) => {
          const entries = Object.entries(row.original.formats) as [
            FormatId,
            string | { title: string },
          ][];
          const first = entries[0];
          return (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="line-clamp-1 font-medium">{row.original.topic}</span>
              {first && (
                <span className="line-clamp-1 text-xs text-muted-foreground">
                  {previewText(first[1])}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'formats',
        header: 'Formats',
        enableSorting: false,
        cell: ({ row }) => {
          const keys = Object.keys(row.original.formats) as FormatId[];
          return (
            <div className="flex flex-wrap gap-1">
              {keys.slice(0, 2).map((key) => (
                <Badge key={key} variant="outline">
                  {FORMAT_LABELS[key] ?? key}
                </Badge>
              ))}
              {keys.length > 2 && <Badge variant="outline">+{keys.length - 2}</Badge>}
            </div>
          );
        },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        sortFn: 'text',
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status]}>{row.original.status}</Badge>
        ),
      },
      {
        id: 'source',
        accessorKey: 'source',
        header: 'Source',
        sortFn: 'text',
        cell: ({ row }) => <Badge variant="muted">{row.original.source}</Badge>,
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: 'Created',
        sortFn: 'datetime',
        meta: { className: 'whitespace-nowrap' },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="text-muted-foreground">{timeAgo(row.original.created_at)}</span>
            {row.original.created_by_name && (
              <span className="text-xs text-muted-foreground">
                by {row.original.created_by_name}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        meta: { className: 'w-0', label: 'Actions' },
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Draft actions"
                onClick={(event) => event.stopPropagation()}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => setPreviewing(row.original)}>
                <Eye />
                Open preview
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={row.original.status === 'approved' || statusMutation.isPending}
                onSelect={() => statusMutation.mutate({ id: row.original._id, next: 'approved' })}
              >
                <Check />
                Approve
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={row.original.status === 'dismissed' || statusMutation.isPending}
                onSelect={() => statusMutation.mutate({ id: row.original._id, next: 'dismissed' })}
              >
                <X />
                Dismiss
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusMutation.isPending],
  );

  if (!teamId) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Drafts" icon={Inbox} guideKey="drafts" />
        <div className="glass-card rounded-xl">
          <EmptyState
            icon={Inbox}
            title="No team yet"
            description="You need to belong to a team to see its drafts."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Drafts"
        icon={Inbox}
        guideKey="drafts"
        description="Everything generated for this team — review, approve, or dismiss. Approving is a one-way move forward."
      />

      <section data-tour="drafts-list" className="glass-card rounded-xl p-5">
        <DataTable
          data={drafts}
          columns={columns}
          getRowId={(row) => row._id}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error}
          onRetry={() => query.refetch()}
          serverPagination={{
            page,
            pageSize,
            total,
            onPageChange: setPage,
            onPageSizeChange: changePageSize,
          }}
          minWidth={880}
          onRowClick={(row) => setPreviewing(row)}
          emptyState={
            <EmptyState
              icon={Sparkles}
              title={status === ALL ? 'No drafts yet' : 'Nothing with that status'}
              description="Generate content from the Feed or the Generate page, or wait for the overnight auto-generation job."
            />
          }
          toolbar={
            <div data-tour="drafts-filters" className="flex flex-wrap items-center gap-2">
              <Tabs value={status} onValueChange={(value) => changeStatus(value as typeof status)}>
                <TabsList>
                  {STATUS_FILTERS.map((option) => (
                    <TabsTrigger key={option.value} value={option.value}>
                      {option.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Select value={source} onValueChange={(value) => changeSource(value as typeof source)}>
                <SelectTrigger size="sm" className="w-[140px]" aria-label="Filter by source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_FILTERS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
          bulkActions={({ rows, clear }) => (
            <>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={bulkMutation.isPending}
                onClick={() =>
                  bulkMutation.mutate(
                    {
                      ids: rows.filter((row) => row.status !== 'approved').map((row) => row._id),
                      next: 'approved',
                    },
                    { onSuccess: clear },
                  )
                }
              >
                {bulkMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={bulkMutation.isPending}
                onClick={() =>
                  bulkMutation.mutate(
                    {
                      ids: rows.filter((row) => row.status !== 'dismissed').map((row) => row._id),
                      next: 'dismissed',
                    },
                    { onSuccess: clear },
                  )
                }
              >
                <X className="size-3.5" />
                Dismiss
              </Button>
            </>
          )}
          renderMobileCard={(row) => (
            <div className="flex flex-col gap-1.5">
              <p className="line-clamp-2 font-medium">{row.topic}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                <Badge variant="muted">{row.source}</Badge>
                <span className="text-xs text-muted-foreground">{timeAgo(row.created_at)}</span>
              </div>
            </div>
          )}
        />
      </section>

      <DraftPreviewDialog
        draft={previewing}
        open={Boolean(previewing)}
        onOpenChange={(open) => !open && setPreviewing(null)}
        isPending={statusMutation.isPending}
        onApprove={() =>
          previewing && statusMutation.mutate({ id: previewing._id, next: 'approved' })
        }
        onDismiss={() =>
          previewing && statusMutation.mutate({ id: previewing._id, next: 'dismissed' })
        }
      />
    </div>
  );
}
