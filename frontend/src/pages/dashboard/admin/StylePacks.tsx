import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, Loader2, Palette, Plus, Trash2 } from 'lucide-react';
import {
  addStyleExample,
  createStylePack,
  deleteStyleExample,
  deleteStylePack,
  listStyleExamples,
  listStylePacks,
  updateStylePack,
  type CreateStylePackPayload,
  type StylePackDto,
} from '@/lib/api/stylePacks';
import type { LanguageStyle } from '@/lib/api/content';
import { useTour } from '@/context/tour-context';
import { PAGE_TOURS } from '@/lib/tours';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHelp } from '@/components/dashboard/PageHelp';

const LANGUAGE_OPTIONS: { value: LanguageStyle; label: string }[] = [
  { value: 'bangla', label: 'বাংলা' },
  { value: 'english', label: 'English' },
  { value: 'banglish', label: 'Banglish' },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

function PackExamples({ packId }: { packId: string }) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');

  const examplesQuery = useQuery({
    queryKey: ['style-pack-examples', packId],
    queryFn: () => listStyleExamples(packId, 1, 50),
  });
  const examples = examplesQuery.data?.data ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['style-pack-examples', packId] });

  const addMutation = useMutation({
    mutationFn: () => addStyleExample(packId, { content: content.trim() }),
    onSuccess: () => {
      toast.success('Example added');
      setContent('');
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['style-packs'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add example'),
  });

  const deleteMutation = useMutation({
    mutationFn: (exampleId: string) => deleteStyleExample(packId, exampleId),
    onSuccess: () => {
      toast.success('Example removed');
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove example'),
  });

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
      <p className="text-xs font-medium text-muted-foreground">
        Examples ({examplesQuery.isLoading ? '…' : examples.length}) — teaches this style with real posts, same
        few-shot mechanism as team brand-voice examples, shared platform-wide.
      </p>
      <div className="flex gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste an example post in this style…"
          rows={2}
          className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-auto shrink-0"
          disabled={!content.trim() || addMutation.isPending}
          onClick={() => addMutation.mutate()}
        >
          Add
        </Button>
      </div>
      {examples.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {examples.map((ex) => (
            <li key={ex._id} className="flex items-start justify-between gap-2 rounded-lg border border-white/10 p-2.5">
              <p className="line-clamp-2 text-sm text-foreground/90">{ex.content}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={deleteMutation.isPending && deleteMutation.variables === ex._id}
                onClick={() => deleteMutation.mutate(ex._id)}
              >
                <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PackRow({ pack }: { pack: StylePackDto }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const toggleActiveMutation = useMutation({
    mutationFn: () => updateStylePack(pack._id, { is_active: !pack.is_active }),
    onSuccess: () => {
      toast.success(pack.is_active ? 'Retired — hidden from teams, existing references still work' : 'Reactivated');
      queryClient.invalidateQueries({ queryKey: ['style-packs'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteStylePack(pack._id),
    onSuccess: () => {
      toast.success(`Deleted "${pack.name}"`);
      queryClient.invalidateQueries({ queryKey: ['style-packs'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Delete failed'),
  });

  return (
    <div className="glass-card flex flex-col rounded-xl">
      <div className="flex w-full items-start justify-between gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 flex-col items-start text-left"
        >
          <div className="flex items-center gap-2">
            <p className="font-medium text-foreground">{pack.name}</p>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-xs',
                pack.is_active
                  ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400'
                  : 'border-white/10 bg-white/5 text-muted-foreground',
              )}
            >
              {pack.is_active ? 'Active' : 'Retired'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {pack.slug} · {pack.language} {pack.tone_tags.length > 0 && `· ${pack.tone_tags.join(', ')}`}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if (window.confirm(`Delete style pack "${pack.name}"? This deletes all its examples too.`)) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
          </Button>
          <button type="button" onClick={() => setExpanded((v) => !v)} className="p-1">
            <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-white/10 p-4">
          {pack.description && <p className="text-sm text-muted-foreground">{pack.description}</p>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={toggleActiveMutation.isPending}
            onClick={() => toggleActiveMutation.mutate()}
          >
            {pack.is_active ? 'Retire this pack' : 'Reactivate this pack'}
          </Button>
          <PackExamples packId={pack._id} />
        </div>
      )}
    </div>
  );
}

export default function StylePacks() {
  const queryClient = useQueryClient();
  const { startTour } = useTour();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [language, setLanguage] = useState<LanguageStyle>('bangla');
  const [toneTags, setToneTags] = useState('');

  const packsQuery = useQuery({ queryKey: ['style-packs', 'all'], queryFn: () => listStylePacks(true) });
  const packs = packsQuery.data ?? [];

  const createMutation = useMutation({
    mutationFn: (payload: CreateStylePackPayload) => createStylePack(payload),
    onSuccess: (created) => {
      toast.success(`Style pack "${created.name}" created`);
      setName('');
      setSlug('');
      setSlugTouched(false);
      setDescription('');
      setToneTags('');
      queryClient.invalidateQueries({ queryKey: ['style-packs'] });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create style pack'),
  });

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleCreate = () => {
    if (!name.trim() || !slug.trim()) {
      toast.error('Name and slug are required');
      return;
    }
    createMutation.mutate({
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim() || undefined,
      language,
      tone_tags: toneTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      is_active: true,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">
            <span className="gradient-text">Style pack</span> library
          </h1>
          <p className="text-sm text-muted-foreground">
            Curated, platform-wide writing styles any team can opt into as their default — on top of their own
            brand-voice examples. Super-admin exclusive.
          </p>
        </div>
        <PageHelp guideKey="stylePacks" onStartTour={() => startTour(PAGE_TOURS.stylePacks)} />
      </div>

      <section data-tour="style-packs-create" className="glass-card flex flex-col gap-4 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-violet-300" />
          <h2 className="font-semibold">Create a style pack</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input placeholder="Name (e.g. Programming Hero)" value={name} onChange={(e) => handleNameChange(e.target.value)} />
          <Input
            placeholder="slug (e.g. programming-hero)"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
          />
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this style — energetic, formal, meme-heavy…? (optional)"
          rows={2}
          className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as LanguageStyle)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-background text-foreground">
                {opt.label}
              </option>
            ))}
          </select>
          <Input
            value={toneTags}
            onChange={(e) => setToneTags(e.target.value)}
            placeholder="Tone tags, comma separated (energetic, technical…)"
            className="w-64"
          />
        </div>
        <Button
          type="button"
          onClick={handleCreate}
          disabled={createMutation.isPending}
          className="btn-glow w-fit gap-2 bg-violet-600 hover:bg-violet-500"
        >
          {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Create style pack
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-violet-300" />
          <h2 className="font-semibold">All packs, including retired</h2>
        </div>
        {packsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : packs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No style packs yet — create the first one above.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {packs.map((pack) => (
              <PackRow key={pack._id} pack={pack} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
