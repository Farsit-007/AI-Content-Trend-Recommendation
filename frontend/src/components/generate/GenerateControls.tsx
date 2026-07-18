import { ExternalLink, Loader2, Sparkles } from 'lucide-react';
import type { FormatId, LanguageStyle } from '@/lib/api/content';
import type { StylePackDto } from '@/lib/api/stylePacks';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const LANGUAGE_OPTIONS: { value: LanguageStyle; label: string }[] = [
  { value: 'bangla', label: 'বাংলা' },
  { value: 'english', label: 'English' },
  { value: 'banglish', label: 'Banglish' },
];

const FORMAT_OPTIONS: { value: FormatId; label: string }[] = [
  { value: 'facebook_post', label: 'Facebook post' },
  { value: 'linkedin_post', label: 'LinkedIn post' },
  { value: 'facebook_reel_script', label: 'Reel script' },
  { value: 'youtube_idea', label: 'YouTube idea' },
  { value: 'caption', label: 'Caption' },
];

interface NewsItemContext {
  title: string;
  url?: string;
  source?: string;
}

interface GenerateControlsProps {
  newsItemContext?: NewsItemContext;
  topic: string;
  onTopicChange: (topic: string) => void;
  language: LanguageStyle;
  onLanguageChange: (language: LanguageStyle) => void;
  stylePacks: StylePackDto[];
  stylePackId: string | undefined;
  onStylePackChange: (id: string | undefined) => void;
  selectedFormats: FormatId[];
  onToggleFormat: (format: FormatId) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export function GenerateControls({
  newsItemContext,
  topic,
  onTopicChange,
  language,
  onLanguageChange,
  stylePacks,
  stylePackId,
  onStylePackChange,
  selectedFormats,
  onToggleFormat,
  onGenerate,
  isGenerating,
}: GenerateControlsProps) {
  const canGenerate = (Boolean(newsItemContext) || topic.trim().length > 0) && selectedFormats.length > 0 && !isGenerating;

  return (
    <div className="glass-card flex flex-col gap-4 rounded-xl p-4">
      {newsItemContext ? (
        <div className="rounded-lg border border-violet-400/30 bg-violet-400/10 p-3">
          <p className="mb-1 text-xs font-medium text-violet-300">Generating from your feed</p>
          <p className="text-sm font-medium text-foreground">{newsItemContext.title}</p>
          {newsItemContext.url && (
            <a
              href={newsItemContext.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-violet-300 hover:underline"
            >
              Source <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="generate-topic" className="text-xs font-medium text-muted-foreground">
            Topic
          </label>
          <Input
            id="generate-topic"
            value={topic}
            onChange={(e) => onTopicChange(e.target.value)}
            placeholder="What should this content be about?"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Language</span>
        <div className="inline-flex w-fit rounded-md border border-white/10 p-0.5">
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onLanguageChange(option.value)}
              className={cn(
                'rounded px-3 py-1 text-sm transition',
                language === option.value ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {stylePacks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="generate-style-pack" className="text-xs font-medium text-muted-foreground">
            Style pack
          </label>
          <select
            id="generate-style-pack"
            value={stylePackId ?? ''}
            onChange={(e) => onStylePackChange(e.target.value || undefined)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="" className="bg-background text-foreground">
              None
            </option>
            {stylePacks.map((pack) => (
              <option key={pack._id} value={pack._id} className="bg-background text-foreground">
                {pack.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Formats</span>
        <div className="flex flex-wrap gap-1.5">
          {FORMAT_OPTIONS.map((option) => {
            const active = selectedFormats.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onToggleFormat(option.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition',
                  active
                    ? 'border-violet-400/50 bg-violet-400/15 text-violet-200'
                    : 'border-white/10 text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <Button onClick={onGenerate} disabled={!canGenerate} className="btn-glow gap-2 bg-violet-600 hover:bg-violet-500">
        {isGenerating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        Generate
      </Button>
    </div>
  );
}
