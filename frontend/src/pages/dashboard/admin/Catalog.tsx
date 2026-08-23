import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Archive,
  Copy,
  Database,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import {
  createNewsItem,
  deleteNewsItem,
  getNewsItems,
  updateNewsItem,
  type NewsItemDto,
} from '@/lib/api/news';
import { NEWS_CATEGORIES } from '@/lib/constants';
import { timeAgo } from '@/lib/datetime';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog } from '@/components/dashboard/FormDialog';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

const NO_CATEGORY = 'none';

const createSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  url: z.url('Enter a valid URL'),
  snippet: z.string().trim().optional(),
  category: z.string(),
});

const editSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  url: z.url('Enter a valid URL'),
  category: z.string(),
  trend_score: z.string(),
  opportunity_score: z.string(),
  impact_note: z.string().trim().optional(),
});

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

/** Optional numeric field: an empty box means "leave it alone", not zero. */
const optionalNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export default function AdminCatalog() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 350);
  const [category, setCategory] = useState('all');
  // 'active' is a UI-only label for "not archived". The backend turns an explicit
  // `?lifecycle=active` into an exact match, which would hide every document ingested before the
  // field existed — omitting the param is what actually means "everything not archived".
  const [lifecycle, setLifecycle] = useState<'active' | 'archived'>('active');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<NewsItemDto | null>(null);
  const [deleting, setDeleting] = useState<NewsItemDto | null>(null);

  // Any filter change invalidates the current page number — page 7 of the old result set is
  // meaningless against the new one. Resetting in the setters rather than an effect keeps it to a
  // single render per interaction.
  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const changeCategory = (value: string) => {
    setCategory(value);
    setPage(1);
  };
  const changeLifecycle = (value: 'active' | 'archived') => {
    setLifecycle(value);
    setPage(1);
  };
  const changePageSize = (value: number) => {
    setPageSize(value);
    setPage(1);
  };

  const catalogQuery = useQuery({
    queryKey: ['catalog', { debouncedSearch, category, lifecycle, page, pageSize }],
    queryFn: () =>
      getNewsItems({
        sort: '-created_at',
        searchTerm: debouncedSearch || undefined,
        category: category === 'all' ? undefined : category,
        lifecycle: lifecycle === 'archived' ? 'archived' : undefined,
        page,
        limit: pageSize,
      }),
  });

  const items = catalogQuery.data?.data ?? [];
  const total = catalogQuery.data?.meta?.total ?? items.length;

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { title: '', url: '', snippet: '', category: NO_CATEGORY },
  });

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      title: '',
      url: '',
      category: NO_CATEGORY,
      trend_score: '',
      opportunity_score: '',
      impact_note: '',
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['catalog'] });

  const createMutation = useMutation({
    mutationFn: createNewsItem,
    onSuccess: () => {
      toast.success('Added to the catalog');
      createForm.reset();
      setCreateOpen(false);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add item'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: EditValues }) =>
      updateNewsItem(id, {
        title: values.title.trim(),
        url: values.url.trim(),
        category: values.category === NO_CATEGORY ? undefined : values.category,
        trend_score: optionalNumber(values.trend_score),
        opportunity_score: optionalNumber(values.opportunity_score),
        impact_note: values.impact_note?.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Saved — this is the shared record every team sees');
      setEditing(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Update failed'),
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: 'active' | 'archived' }) =>
      updateNewsItem(id, { lifecycle: next }),
    onSuccess: (_result, { next }) => {
      toast.success(next === 'archived' ? 'Archived' : 'Restored to the active feed');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Could not change lifecycle'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteNewsItem(id),
    onSuccess: () => {
      toast.success('Deleted');
      setDeleting(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Delete failed'),
  });

  const openEdit = (item: NewsItemDto) => {
    editForm.reset({
      title: item.title,
      url: item.url,
      category: item.category ?? NO_CATEGORY,
      trend_score: item.trend_score != null ? String(item.trend_score) : '',
      opportunity_score: item.opportunity_score != null ? String(item.opportunity_score) : '',
      impact_note: item.impact_note ?? '',
    });
    setEditing(item);
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success('Item ID copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const columns = useMemo<DataTableColumn<NewsItemDto>[]>(
    () => [
      {
        id: 'title',
        accessorKey: 'title',
        header: 'Story',
        sortFn: 'text',
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="line-clamp-2 font-medium">{row.original.title}</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {row.original.source}
              {row.original.is_overridden && <Badge variant="outline">Overridden</Badge>}
              {row.original.needs_review && <Badge variant="trend">Needs review</Badge>}
            </span>
          </div>
        ),
      },
      {
        id: 'category',
        accessorKey: 'category',
        header: 'Category',
        sortFn: 'text',
        cell: ({ row }) =>
          row.original.category ? (
            <Badge variant="brand">{row.original.category}</Badge>
          ) : (
            <Badge variant="outline">Uncategorized</Badge>
          ),
      },
      {
        id: 'trend_score',
        accessorKey: 'trend_score',
        header: 'Trend',
        sortFn: 'basic',
        meta: { className: 'tabular-nums' },
        cell: ({ row }) => (row.original.trend_score ?? 0).toFixed(1),
      },
      {
        id: 'opportunity_score',
        accessorKey: 'opportunity_score',
        header: 'Opportunity',
        sortFn: 'basic',
        meta: { className: 'tabular-nums' },
        cell: ({ row }) =>
          typeof row.original.opportunity_score === 'number' ? (
            <span className={row.original.high_opportunity ? 'text-opportunity' : undefined}>
              {row.original.opportunity_score.toFixed(1)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: 'Added',
        sortFn: 'datetime',
        meta: { className: 'whitespace-nowrap' },
        cell: ({ row }) => (
          <span className="text-muted-foreground">{timeAgo(row.original.created_at)}</span>
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
              <Button variant="ghost" size="icon-sm" aria-label="Item actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate">{row.original.source}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => openEdit(row.original)}>
                <Pencil />
                Edit story
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={row.original.url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink />
                  Open source
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => copyId(row.original._id)}>
                <Copy />
                Copy item ID
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  archiveMutation.mutate({
                    id: row.original._id,
                    next: lifecycle === 'archived' ? 'active' : 'archived',
                  })
                }
              >
                <Archive />
                {lifecycle === 'archived' ? 'Restore to feed' : 'Archive'}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row.original)}>
                <Trash2 />
                Delete for everyone
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lifecycle],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="catalog"
        accent="News"
        icon={Database}
        guideKey="catalog"
        description="The shared record every team sees. Backfill a story the pipeline missed, or correct one — changes here are global, unlike a per-team override on the Feed."
        actions={
          <Button
            data-tour="catalog-create"
            className="btn-glow gap-2"
            onClick={() => setCreateOpen(true)}
          >
            <Plus />
            Backfill a story
          </Button>
        }
      />

      <section className="glass-card rounded-xl p-5">
        <DataTable
          data={items}
          columns={columns}
          getRowId={(row) => row._id}
          isLoading={catalogQuery.isLoading}
          isFetching={catalogQuery.isFetching}
          error={catalogQuery.error}
          onRetry={() => catalogQuery.refetch()}
          search={{
            value: search,
            onChange: changeSearch,
            placeholder: 'Search the catalog',
            mode: 'server',
          }}
          serverPagination={{
            page,
            pageSize,
            total,
            onPageChange: setPage,
            onPageSizeChange: changePageSize,
          }}
          minWidth={880}
          emptyState={
            <EmptyState
              icon={Database}
              title={debouncedSearch ? 'No stories match that search' : 'Nothing in the catalog yet'}
              description={
                lifecycle === 'archived'
                  ? 'Nothing has been archived by the retention job yet.'
                  : 'The ingestion pipeline fills this automatically — or backfill one by hand.'
              }
            />
          }
          toolbar={
            <>
              <Select value={category} onValueChange={changeCategory}>
                <SelectTrigger size="sm" className="w-[150px]" aria-label="Filter by category">
                  <SelectValue placeholder="Every category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Every category</SelectItem>
                  {NEWS_CATEGORIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={lifecycle}
                onValueChange={(value) => changeLifecycle(value as 'active' | 'archived')}
              >
                <SelectTrigger size="sm" className="w-[130px]" aria-label="Filter by lifecycle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
          renderMobileCard={(row) => (
            <div className="flex flex-col gap-1.5">
              <p className="line-clamp-2 font-medium">{row.title}</p>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span>{row.source}</span>
                {row.category && <Badge variant="brand">{row.category}</Badge>}
                <span className="tabular-nums">trend {(row.trend_score ?? 0).toFixed(1)}</span>
                <span>{timeAgo(row.created_at)}</span>
              </div>
            </div>
          )}
        />
      </section>

      <FormDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) createForm.reset();
        }}
        title="Backfill a story"
        description="Adds a manual item to the shared catalog, visible to every team."
        icon={Plus}
        form={createForm}
        isPending={createMutation.isPending}
        submitLabel="Add to catalog"
        onSubmit={(values) => {
          // `source_id` and `content_hash` are the dedup keys; a manual row needs unique ones
          // that cannot collide with an ingested item.
          const uniqueSuffix = 'manual-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
          createMutation.mutate({
            source: 'manual',
            source_id: uniqueSuffix,
            content_hash: uniqueSuffix,
            title: values.title.trim(),
            url: values.url.trim(),
            snippet: values.snippet?.trim() || undefined,
            category: values.category === NO_CATEGORY ? undefined : values.category,
          });
        }}
      >
        <FormField
          control={createForm.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="What happened" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={createForm.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Source URL</FormLabel>
              <FormControl>
                <Input placeholder="https://" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={createForm.control}
          name="snippet"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Snippet (optional)</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="A one-or-two sentence teaser" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={createForm.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>Let the pipeline decide</SelectItem>
                  {NEWS_CATEGORIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormDialog>

      <FormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit story"
        description="These edits are global — every team sees them immediately."
        icon={Pencil}
        form={editForm}
        isPending={updateMutation.isPending}
        submitLabel="Save changes"
        className="sm:max-w-xl"
        onSubmit={(values) => {
          if (!editing) return;
          updateMutation.mutate({ id: editing._id, values });
        }}
      >
        <FormField
          control={editForm.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={editForm.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Source URL</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField
            control={editForm.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>Uncategorized</SelectItem>
                    {NEWS_CATEGORIES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={editForm.control}
            name="trend_score"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trend score</FormLabel>
                <FormControl>
                  <Input type="number" step="0.1" placeholder="0.0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={editForm.control}
            name="opportunity_score"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Opportunity</FormLabel>
                <FormControl>
                  <Input type="number" step="0.1" placeholder="0.0" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={editForm.control}
          name="impact_note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Why it matters</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="The impact note shown on the card" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={'Delete "' + (deleting?.title ?? '') + '" for every team?'}
        description="This cannot be undone. To take it out of the feed without losing the record, archive it instead."
        confirmLabel="Delete story"
        onConfirm={() => deleting && deleteMutation.mutate(deleting._id)}
      />
    </div>
  );
}
