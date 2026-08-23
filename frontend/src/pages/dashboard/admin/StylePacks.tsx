import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Loader2,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';

import {
  addStyleExample,
  bulkAddExamples,
  createStylePack,
  deleteStyleExample,
  deleteStylePack,
  generateCard,
  getStylePack,
  listStyleExamples,
  listStylePacks,
  updateStylePack,
  type CreateStyleExamplePayload,
  type StylePackDto,
} from '@/lib/api/stylePacks';
import type { LanguageStyle } from '@/lib/api/content';
import { formatDate, timeAgo } from '@/lib/datetime';
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
import { ExpandableTextarea } from '@/components/ui/expandable-textarea';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { FormDialog } from '@/components/dashboard/FormDialog';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { ConfirmButton } from '@/components/shared/ConfirmButton';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

const LANGUAGE_OPTIONS: { value: LanguageStyle; label: string }[] = [
  { value: 'bangla', label: 'বাংলা' },
  { value: 'english', label: 'English' },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const packSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, and dashes only'),
  description: z.string().trim().optional(),
  language: z.enum(['bangla', 'english']),
  tone_tags: z.string().optional(),
});

const exampleSchema = z.object({
  content: z.string().trim().min(1, 'Paste the example post'),
});

const bulkSchema = z.object({
  json: z.string().trim().min(1, 'Paste a JSON array'),
});

type PackValues = z.infer<typeof packSchema>;
type ExampleValues = z.infer<typeof exampleSchema>;
type BulkValues = z.infer<typeof bulkSchema>;

const parseToneTags = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

/** Parses and shape-validates a pasted bulk-import JSON array before it ever reaches the network —
 *  mirrors the backend's item shape so a malformed paste fails fast with a specific reason. */
function parseBulkImportJson(raw: string): { items?: CreateStyleExamplePayload[]; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'Not valid JSON' };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: 'Expected a non-empty JSON array' };
  }
  if (parsed.length > 100) {
    return { error: 'Batch has ' + parsed.length + ' items — max is 100' };
  }
  const items: CreateStyleExamplePayload[] = [];
  for (const [index, entry] of parsed.entries()) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as { content?: unknown }).content !== 'string'
    ) {
      return { error: 'Item ' + (index + 1) + ' is missing a string "content" field' };
    }
    const record = entry as Record<string, unknown>;
    items.push({
      content: record.content as string,
      platform: record.platform as CreateStyleExamplePayload['platform'] | undefined,
      source_ref: record.source_ref as string | undefined,
      engagement_hint: record.engagement_hint as string | undefined,
    });
  }
  return { items };
}

/**
 * One pack, opened as a side panel: its style card (with staleness), and its example corpus.
 * Staleness is derived, not flagged by the API — compare `style_card_example_count` against the
 * pack's live example count.
 */
function PackDetailSheet({
  pack,
  open,
  onOpenChange,
}: {
  pack: StylePackDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const packId = pack?._id;
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const exampleForm = useForm<ExampleValues>({
    resolver: zodResolver(exampleSchema),
    defaultValues: { content: '' },
  });

  const bulkForm = useForm<BulkValues>({
    resolver: zodResolver(bulkSchema),
    defaultValues: { json: '' },
  });

  const detailQuery = useQuery({
    queryKey: ['style-pack-detail', packId],
    queryFn: () => getStylePack(packId as string),
    enabled: Boolean(packId) && open,
  });

  const examplesQuery = useQuery({
    queryKey: ['style-pack-examples', packId],
    queryFn: () => listStyleExamples(packId as string, 1, 50),
    enabled: Boolean(packId) && open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['style-pack-examples', packId] });
    queryClient.invalidateQueries({ queryKey: ['style-pack-detail', packId] });
    queryClient.invalidateQueries({ queryKey: ['style-packs'] });
  };

  const addMutation = useMutation({
    mutationFn: (values: ExampleValues) =>
      addStyleExample(packId as string, { content: values.content.trim() }),
    onSuccess: () => {
      toast.success('Example added');
      exampleForm.reset();
      setAddOpen(false);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add example'),
  });

  const bulkMutation = useMutation({
    mutationFn: (items: CreateStyleExamplePayload[]) => bulkAddExamples(packId as string, items),
    onSuccess: (result) => {
      toast.success(
        'Imported ' + result.created + ' example(s), skipped ' + result.skipped + ' duplicate(s)',
      );
      bulkForm.reset();
      setBulkOpen(false);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Bulk import failed'),
  });

  const deleteExampleMutation = useMutation({
    mutationFn: (exampleId: string) => deleteStyleExample(packId as string, exampleId),
    onSuccess: () => {
      toast.success('Example removed');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove example'),
  });

  const generateCardMutation = useMutation({
    mutationFn: () => generateCard(packId as string),
    onSuccess: () => {
      toast.success('Style card generated');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to generate style card'),
  });

  const examples = examplesQuery.data?.data ?? [];
  const exampleCount = detailQuery.data?.example_count ?? examplesQuery.data?.meta?.total;
  const livePack = detailQuery.data ?? pack;

  const neverGenerated = !livePack?.style_card;
  const isStale =
    Boolean(livePack?.style_card) &&
    exampleCount !== undefined &&
    livePack?.style_card_example_count !== exampleCount;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <Palette className="size-4 text-brand" />
            {pack?.name}
            {pack && (
              <Badge variant={pack.is_active ? 'opportunity' : 'muted'}>
                {pack.is_active ? 'Active' : 'Retired'}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {pack?.slug} · {pack?.language}
            {pack && pack.tone_tags.length > 0 ? ' · ' + pack.tone_tags.join(', ') : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          {pack?.description && <p className="text-sm text-muted-foreground">{pack.description}</p>}

          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-brand" />
                <p className="text-sm font-medium">Style card</p>
                {(isStale || neverGenerated) && (
                  <Badge variant="trend">{neverGenerated ? 'Never generated' : 'Stale'}</Badge>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={generateCardMutation.isPending}
                onClick={() => generateCardMutation.mutate()}
              >
                {generateCardMutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
                {livePack?.style_card ? 'Regenerate' : 'Generate'}
              </Button>
            </div>
            {livePack?.style_card ? (
              <>
                <p className="text-sm whitespace-pre-wrap text-foreground/90">
                  {livePack.style_card}
                </p>
                {livePack.style_card_generated_at && (
                  <p className="text-xs text-muted-foreground">
                    Generated {formatDate(livePack.style_card_generated_at)} from{' '}
                    {livePack.style_card_example_count ?? '?'} example(s)
                    {exampleCount !== undefined ? ' · now ' + exampleCount + ' in the pack' : ''}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                No style card yet — generate one once the pack has examples.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                Examples {exampleCount !== undefined ? '(' + exampleCount + ')' : ''}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setBulkOpen(true)}
                >
                  <Upload className="size-3.5" />
                  Bulk import
                </Button>
                <Button type="button" size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
                  <Plus className="size-3.5" />
                  Add
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Teaches this style with real posts — the same few-shot mechanism as a team&apos;s
              brand-voice examples, shared platform-wide.
            </p>

            {examplesQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading examples…
              </div>
            ) : examples.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="No examples yet"
                description="Paste a few real posts written in this style."
              />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {examples.map((example) => (
                  <li
                    key={example._id}
                    className="flex items-start justify-between gap-2 rounded-lg border border-border p-2.5"
                  >
                    <p className="line-clamp-3 text-sm text-foreground/90">{example.content}</p>
                    <ConfirmButton
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete style example"
                      disabled={
                        deleteExampleMutation.isPending &&
                        deleteExampleMutation.variables === example._id
                      }
                      title="Delete this example?"
                      description="The style card should be regenerated afterwards."
                      onConfirm={() => deleteExampleMutation.mutate(example._id)}
                    >
                      <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                    </ConfirmButton>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <SheetFooter className="border-t border-border">
          <p className="text-xs text-muted-foreground">
            Showing the first 50 examples. The style card is built from the full corpus.
          </p>
        </SheetFooter>
      </SheetContent>

      <FormDialog
        open={addOpen}
        onOpenChange={(next) => {
          setAddOpen(next);
          if (!next) exampleForm.reset();
        }}
        title="Add a style example"
        description="One real post, in the voice this pack teaches."
        icon={Plus}
        form={exampleForm}
        isPending={addMutation.isPending}
        submitLabel="Add example"
        onSubmit={(values) => addMutation.mutate(values)}
      >
        <FormField
          control={exampleForm.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Example post</FormLabel>
              <FormControl>
                <ExpandableTextarea
                  rows={6}
                  placeholder="Paste an example post in this style…"
                  expandTitle="Add style example"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormDialog>

      <FormDialog
        open={bulkOpen}
        onOpenChange={(next) => {
          setBulkOpen(next);
          if (!next) bulkForm.reset();
        }}
        title="Bulk import examples"
        description="Paste a JSON array, up to 100 items. Duplicates are skipped server-side."
        icon={Upload}
        form={bulkForm}
        isPending={bulkMutation.isPending}
        submitLabel="Import batch"
        className="sm:max-w-2xl"
        onSubmit={(values) => {
          const { items, error } = parseBulkImportJson(values.json);
          if (error) {
            bulkForm.setError('json', { message: error });
            return;
          }
          bulkMutation.mutate(items as CreateStyleExamplePayload[]);
        }}
      >
        <FormField
          control={bulkForm.control}
          name="json"
          render={({ field }) => (
            <FormItem>
              <FormLabel>JSON array</FormLabel>
              <FormControl>
                <ExpandableTextarea
                  rows={10}
                  maxAutoGrowPx={480}
                  className="font-mono text-xs"
                  placeholder={
                    '[{ "content": "...", "platform": "facebook", "source_ref": "...", "engagement_hint": "..." }]'
                  }
                  expandTitle="Bulk import — JSON array"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormDialog>
    </Sheet>
  );
}

export default function StylePacks() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<StylePackDto | null>(null);
  const [detailPack, setDetailPack] = useState<StylePackDto | null>(null);
  const [deleting, setDeleting] = useState<StylePackDto | null>(null);

  const packsQuery = useQuery({
    queryKey: ['style-packs', 'all'],
    queryFn: () => listStylePacks(true),
  });
  const packs = packsQuery.data ?? [];

  const createForm = useForm<PackValues>({
    resolver: zodResolver(packSchema),
    defaultValues: { name: '', slug: '', description: '', language: 'bangla', tone_tags: '' },
  });

  const editForm = useForm<PackValues>({
    resolver: zodResolver(packSchema),
    defaultValues: { name: '', slug: '', description: '', language: 'bangla', tone_tags: '' },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['style-packs'] });

  const createMutation = useMutation({
    mutationFn: (values: PackValues) =>
      createStylePack({
        name: values.name.trim(),
        slug: values.slug.trim(),
        description: values.description?.trim() || undefined,
        language: values.language,
        tone_tags: parseToneTags(values.tone_tags),
        is_active: true,
      }),
    onSuccess: (created) => {
      toast.success('Style pack "' + created.name + '" created');
      createForm.reset();
      setCreateOpen(false);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create style pack'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: PackValues }) =>
      updateStylePack(id, {
        name: values.name.trim(),
        slug: values.slug.trim(),
        description: values.description?.trim() || '',
        language: values.language,
        tone_tags: parseToneTags(values.tone_tags),
      }),
    onSuccess: () => {
      toast.success('Style pack updated');
      setEditing(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Update failed'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (pack: StylePackDto) => updateStylePack(pack._id, { is_active: !pack.is_active }),
    onSuccess: (updated) => {
      toast.success(
        updated.is_active
          ? 'Reactivated'
          : 'Retired — hidden from teams, existing references still work',
      );
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStylePack(id),
    onSuccess: (deleted) => {
      toast.success('Deleted "' + deleted.name + '"');
      setDeleting(null);
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Delete failed'),
  });

  const generateCardMutation = useMutation({
    mutationFn: (id: string) => generateCard(id),
    onSuccess: () => {
      toast.success('Style card generated');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to generate style card'),
  });

  const openEdit = (pack: StylePackDto) => {
    editForm.reset({
      name: pack.name,
      slug: pack.slug,
      description: pack.description ?? '',
      language: pack.language,
      tone_tags: pack.tone_tags.join(', '),
    });
    setEditing(pack);
  };

  const activeCount = packs.filter((pack) => pack.is_active).length;
  const withCard = packs.filter((pack) => Boolean(pack.style_card)).length;

  const columns = useMemo<DataTableColumn<StylePackDto>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Pack',
        sortFn: 'text',
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.original.name}</span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              {row.original.slug}
            </span>
          </div>
        ),
      },
      {
        id: 'language',
        accessorKey: 'language',
        header: 'Language',
        sortFn: 'text',
        cell: ({ row }) => <Badge variant="muted">{row.original.language}</Badge>,
      },
      {
        id: 'tone_tags',
        header: 'Tone',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.tone_tags.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.tone_tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
              {row.original.tone_tags.length > 3 && (
                <Badge variant="outline">+{row.original.tone_tags.length - 3}</Badge>
              )}
            </div>
          ),
      },
      {
        id: 'style_card',
        header: 'Style card',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.style_card ? (
            <div className="flex flex-col">
              <Badge variant="opportunity">
                From {row.original.style_card_example_count ?? '?'} examples
              </Badge>
              {row.original.style_card_generated_at && (
                <span className="mt-0.5 text-xs text-muted-foreground">
                  {timeAgo(row.original.style_card_generated_at)}
                </span>
              )}
            </div>
          ) : (
            <Badge variant="trend">Never generated</Badge>
          ),
      },
      {
        id: 'is_active',
        accessorKey: 'is_active',
        header: 'Active',
        enableSorting: false,
        cell: ({ row }) => (
          <Switch
            aria-label={'Activate ' + row.original.name}
            checked={row.original.is_active}
            disabled={toggleActiveMutation.isPending}
            onCheckedChange={() => toggleActiveMutation.mutate(row.original)}
            onClick={(event) => event.stopPropagation()}
          />
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
              <Button variant="ghost" size="icon-sm" aria-label="Pack actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate">{row.original.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setDetailPack(row.original)}>
                <Palette />
                Examples &amp; style card
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => openEdit(row.original)}>
                <Pencil />
                Edit pack
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={generateCardMutation.isPending}
                onSelect={() => generateCardMutation.mutate(row.original._id)}
              >
                <Sparkles />
                {row.original.style_card ? 'Regenerate card' : 'Generate card'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row.original)}>
                <Trash2 />
                Delete pack
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toggleActiveMutation.isPending, generateCardMutation.isPending],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        accent="Style pack"
        title="library"
        icon={Palette}
        guideKey="stylePacks"
        description="Curated, platform-wide writing styles any team can opt into as their default — on top of their own brand-voice examples. Super-admin exclusive."
        actions={
          <Button
            data-tour="style-packs-create"
            className="btn-glow gap-2"
            onClick={() => setCreateOpen(true)}
          >
            <Plus />
            New style pack
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={Palette} label="Packs" value={packs.length} accent="brand" />
        <StatCard icon={Palette} label="Active" value={activeCount} accent="opportunity" />
        <StatCard
          icon={Sparkles}
          label="With a style card"
          value={withCard}
          accent={withCard === packs.length ? 'opportunity' : 'trend'}
        />
      </div>

      <section className="glass-card rounded-xl p-5">
        <DataTable
          data={packs}
          columns={columns}
          getRowId={(row) => row._id}
          isLoading={packsQuery.isLoading}
          isFetching={packsQuery.isFetching}
          error={packsQuery.error}
          onRetry={() => packsQuery.refetch()}
          search={{ value: search, onChange: setSearch, placeholder: 'Search packs' }}
          minWidth={900}
          pageSize={25}
          onRowClick={(row) => setDetailPack(row)}
          emptyState={
            <EmptyState
              icon={Palette}
              title="No style packs yet"
              description="Name a style, teach it with real posts, then let any team adopt it."
              action={
                <Button variant="outline" className="gap-2" onClick={() => setCreateOpen(true)}>
                  <Plus />
                  New style pack
                </Button>
              }
            />
          }
          renderMobileCard={(row) => (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{row.name}</span>
                <Badge variant={row.is_active ? 'opportunity' : 'muted'}>
                  {row.is_active ? 'Active' : 'Retired'}
                </Badge>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{row.slug}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="muted">{row.language}</Badge>
                {row.style_card ? (
                  <Badge variant="opportunity">Card ready</Badge>
                ) : (
                  <Badge variant="trend">No card</Badge>
                )}
              </div>
            </div>
          )}
        />
      </section>

      <PackDetailSheet
        pack={detailPack}
        open={Boolean(detailPack)}
        onOpenChange={(open) => !open && setDetailPack(null)}
      />

      <FormDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) createForm.reset();
        }}
        title="Create a style pack"
        description="Name it and describe its tone; teach it with examples once it exists."
        icon={Plus}
        form={createForm}
        isPending={createMutation.isPending}
        submitLabel="Create style pack"
        onSubmit={(values) => createMutation.mutate(values)}
      >
        <FormField
          control={createForm.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Programming Hero"
                  {...field}
                  onChange={(event) => {
                    field.onChange(event);
                    // Slug mirrors the name until the operator edits it by hand.
                    if (!createForm.getFieldState('slug').isDirty) {
                      createForm.setValue('slug', slugify(event.target.value));
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={createForm.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input placeholder="programming-hero" className="font-mono" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={createForm.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (optional)</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="Energetic, formal, meme-heavy…?" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={createForm.control}
            name="language"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Language</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={createForm.control}
            name="tone_tags"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tone tags</FormLabel>
                <FormControl>
                  <Input placeholder="energetic, technical" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </FormDialog>

      <FormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Edit style pack"
        description="Renaming does not affect its examples or the generated style card."
        icon={Pencil}
        form={editForm}
        isPending={updateMutation.isPending}
        submitLabel="Save changes"
        onSubmit={(values) => {
          if (!editing) return;
          updateMutation.mutate({ id: editing._id, values });
        }}
      >
        <FormField
          control={editForm.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={editForm.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input className="font-mono" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={editForm.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={editForm.control}
            name="language"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Language</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
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
            name="tone_tags"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tone tags</FormLabel>
                <FormControl>
                  <Input placeholder="energetic, technical" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={'Delete style pack "' + (deleting?.name ?? '') + '"?'}
        description="This deletes all of its examples too. To hide it from teams without losing it, retire it instead."
        confirmLabel="Delete pack"
        onConfirm={() => deleting && deleteMutation.mutate(deleting._id)}
      />
    </div>
  );
}
