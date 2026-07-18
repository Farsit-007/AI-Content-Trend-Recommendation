import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
import {
  createBrandVoiceExample,
  deleteBrandVoiceExample,
  listBrandVoiceExamples,
  type BrandVoicePlatform,
} from '@/lib/api/brandVoice';
import { Button } from '@/components/ui/button';
import { ExpandableTextarea } from '@/components/ui/expandable-textarea';
import { Input } from '@/components/ui/input';

const PLATFORM_OPTIONS: { value: BrandVoicePlatform; label: string }[] = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'other', label: 'Other' },
];

const EMPTY_STATE_COPY = 'Add 25–30 of your real posts — every generation copies your style from these.';

interface BrandVoiceSectionProps {
  teamId: string;
  isAdmin: boolean;
  categories: string[];
}

export function BrandVoiceSection({ teamId, isAdmin, categories }: BrandVoiceSectionProps) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [platform, setPlatform] = useState<BrandVoicePlatform>('facebook');
  const [category, setCategory] = useState('');
  const [engagementHint, setEngagementHint] = useState('');

  const listQuery = useQuery({
    queryKey: ['brand-voice', teamId],
    queryFn: () => listBrandVoiceExamples({ team_id: teamId }),
  });
  const examples = listQuery.data?.data ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['brand-voice', teamId] });

  const createMutation = useMutation({
    mutationFn: createBrandVoiceExample,
    onSuccess: () => {
      toast.success('Example added');
      setContent('');
      setEngagementHint('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBrandVoiceExample,
    onSuccess: () => {
      toast.success('Example removed');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleAdd = () => {
    if (!content.trim()) return;
    createMutation.mutate({
      team_id: teamId,
      platform,
      content: content.trim(),
      category: category || undefined,
      engagement_hint: engagementHint.trim() || undefined,
    });
  };

  return (
    <section className="glass-card flex flex-col gap-4 rounded-xl p-6">
      <div>
        <h2 className="text-lg font-semibold">Brand voice examples</h2>
        <p className="text-sm text-muted-foreground">{EMPTY_STATE_COPY}</p>
      </div>

      {isAdmin && (
        <div className="flex flex-col gap-2 rounded-lg border border-white/10 p-3">
          <ExpandableTextarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste a real post that sounds like your team…"
            rows={3}
            expandTitle="Add brand voice example"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as BrandVoicePlatform)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-background text-foreground">
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            >
              <option value="" className="bg-background text-foreground">
                No category
              </option>
              {categories.map((c) => (
                <option key={c} value={c} className="bg-background text-foreground">
                  {c}
                </option>
              ))}
            </select>
            <Input
              value={engagementHint}
              onChange={(e) => setEngagementHint(e.target.value)}
              placeholder="Engagement hint (optional)"
              className="w-48"
            />
          </div>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={!content.trim() || createMutation.isPending}
            className="btn-glow w-fit bg-violet-600 hover:bg-violet-500"
          >
            {createMutation.isPending ? 'Adding…' : 'Add example'}
          </Button>
        </div>
      )}

      {listQuery.isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}

      {!listQuery.isLoading && examples.length === 0 && (
        <div className="rounded-lg border border-dashed border-white/15 p-6 text-center text-sm text-muted-foreground">
          No brand voice examples yet. {EMPTY_STATE_COPY}
        </div>
      )}

      {examples.length > 0 && (
        <ul className="flex flex-col gap-2">
          {examples.map((example) => (
            <li
              key={example._id}
              className="flex items-start justify-between gap-3 rounded-lg border border-white/10 p-3"
            >
              <div className="flex flex-col gap-1">
                <p className="line-clamp-2 text-sm">{example.content}</p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-white/10 px-2 py-0.5">{example.platform}</span>
                  {example.category && (
                    <span className="rounded-full border border-white/10 px-2 py-0.5">{example.category}</span>
                  )}
                </div>
              </div>
              {isAdmin && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={deleteMutation.isPending && deleteMutation.variables === example._id}
                  onClick={() => {
                    if (window.confirm('Delete this brand voice example?')) deleteMutation.mutate(example._id);
                  }}
                >
                  <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
