import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy, RotateCcw, Sparkles, Undo2 } from 'lucide-react';
import type { FormatId } from '@/lib/api/content';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ExpandableTextarea } from '@/components/ui/expandable-textarea';

const FORMAT_LABELS: Record<FormatId, string> = {
  facebook_post: 'Facebook post',
  linkedin_post: 'LinkedIn post',
  facebook_reel_script: 'Facebook Reel script',
  caption: 'Caption',
  youtube_idea: 'YouTube video idea',
};

interface CounterConfig {
  unit: 'words' | 'chars';
  min?: number;
  max?: number;
}

/** Mirrors the backend's per-format length directives (contentGeneration.formats.ts). */
const COUNTER_CONFIG: Partial<Record<FormatId, CounterConfig>> = {
  facebook_post: { unit: 'words', min: 150, max: 400 },
  linkedin_post: { unit: 'chars', min: 1200, max: 2500 },
  caption: { unit: 'chars', max: 200 },
  facebook_reel_script: { unit: 'chars' },
};

const REFINE_CHIPS: { label: string; instruction: string }[] = [
  { label: 'ছোট করো', instruction: 'Make it noticeably shorter.' },
  { label: 'আরো casual', instruction: 'Make the tone more casual and conversational.' },
  { label: 'Stronger hook', instruction: 'Rewrite the opening line to be a stronger, more attention-grabbing hook.' },
  { label: 'Add CTA', instruction: 'Add a clear call-to-action at the end.' },
];

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

interface FormatCardProps {
  format: FormatId;
  text: string;
  previousText?: string;
  onChange: (text: string) => void;
  onRegenerate: () => void;
  onRefine: (instruction: string) => void;
  onUndo: () => void;
  isRegenerating: boolean;
  isRefining: boolean;
}

export function FormatCard({
  format,
  text,
  previousText,
  onChange,
  onRegenerate,
  onRefine,
  onUndo,
  isRegenerating,
  isRefining,
}: FormatCardProps) {
  const [copied, setCopied] = useState(false);
  const [freeText, setFreeText] = useState('');
  const busy = isRegenerating || isRefining;

  const config = COUNTER_CONFIG[format];
  const count = config ? (config.unit === 'words' ? wordCount(text) : text.length) : 0;
  const outOfRange = config && ((config.min && count < config.min) || (config.max && count > config.max));

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`${FORMAT_LABELS[format]} copied`);
    setTimeout(() => setCopied(false), 1500);
  };

  const submitFreeText = () => {
    const trimmed = freeText.trim();
    if (!trimmed) return;
    onRefine(trimmed);
    setFreeText('');
  };

  return (
    <div className="glass-card flex flex-col gap-3 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground">{FORMAT_LABELS[format]}</h3>
        {previousText !== undefined && (
          <Button variant="ghost" size="sm" onClick={onUndo} disabled={busy} className="gap-1.5 text-muted-foreground">
            <Undo2 className="size-3.5" /> Undo
          </Button>
        )}
      </div>

      <ExpandableTextarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        disabled={busy}
        rows={4}
        maxAutoGrowPx={480}
        expandTitle={`Edit ${FORMAT_LABELS[format]}`}
      />

      {config && (
        <p className={cn('text-xs', outOfRange ? 'text-trend' : 'text-muted-foreground')}>
          {count} {config.unit}
          {config.min && config.max && ` (target: ${config.min}-${config.max} ${config.unit})`}
          {!config.min && config.max && ` (max ${config.max} ${config.unit})`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" variant="outline" onClick={onRegenerate} disabled={busy} className="gap-1.5">
          <RotateCcw className={cn('size-3.5', isRegenerating && 'animate-spin')} />
          Regenerate
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex flex-wrap gap-1.5">
          {REFINE_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              disabled={busy}
              onClick={() => onRefine(chip.instruction)}
              className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-xs text-brand transition hover:bg-violet-400/20 disabled:pointer-events-none disabled:opacity-50"
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <ExpandableTextarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value.slice(0, 300))}
            placeholder="Custom tweak instruction… (Enter to submit, Shift+Enter for a new line)"
            disabled={busy}
            rows={1}
            maxAutoGrowPx={120}
            maxLength={300}
            expandTitle="Custom tweak instruction"
            // Preserves the original <Input>'s bare-Enter-submits behavior (least surprising for
            // existing users) while still letting a textarea do what a single-line input couldn't:
            // Shift+Enter inserts a newline instead of submitting, standard chat-UI convention.
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitFreeText();
              }
            }}
          />
          <Button size="sm" onClick={submitFreeText} disabled={busy || !freeText.trim()} className="gap-1.5">
            <Sparkles className={cn('size-3.5', isRefining && 'animate-spin')} />
            Refine
          </Button>
        </div>
      </div>
    </div>
  );
}
