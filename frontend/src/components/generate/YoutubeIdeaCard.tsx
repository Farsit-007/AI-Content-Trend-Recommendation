import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Copy } from 'lucide-react';
import type { YoutubeIdea } from '@/lib/api/content';
import { Button } from '@/components/ui/button';

interface YoutubeIdeaCardProps {
  idea: YoutubeIdea;
}

const serialize = (idea: YoutubeIdea): string =>
  [
    `Title: ${idea.title}`,
    `Hook: ${idea.hook}`,
    'Chapters:',
    ...idea.chapters.map((chapter, i) => `  ${i + 1}. ${chapter}`),
    `Thumbnail concept: ${idea.thumbnail_concept}`,
  ].join('\n');

export function YoutubeIdeaCard({ idea }: YoutubeIdeaCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(serialize(idea));
    setCopied(true);
    toast.success('YouTube idea copied');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="glass-card flex flex-col gap-3 rounded-xl p-4">
      <h3 className="font-semibold text-foreground">YouTube video idea</h3>

      <div className="flex flex-col gap-2 text-sm">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Title</p>
          <p className="text-foreground">{idea.title}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Hook</p>
          <p className="text-foreground">{idea.hook}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Chapters</p>
          <ol className="list-decimal space-y-0.5 pl-4 text-foreground">
            {idea.chapters.map((chapter, i) => (
              <li key={i}>{chapter}</li>
            ))}
          </ol>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Thumbnail concept</p>
          <p className="text-foreground">{idea.thumbnail_concept}</p>
        </div>
      </div>

      <Button size="sm" variant="outline" onClick={handleCopy} className="w-fit gap-1.5">
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? 'Copied' : 'Copy as text'}
      </Button>
    </div>
  );
}
