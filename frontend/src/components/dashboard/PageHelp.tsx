import { CircleHelp, Compass, Lightbulb, ListChecks, Sparkles } from 'lucide-react';
import { PAGE_GUIDES } from '@/lib/pageGuides';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface PageHelpProps {
  guideKey: keyof typeof PAGE_GUIDES;
  /** Renders the "Take a tour" trigger alongside the help button when this page has one. */
  onStartTour?: () => void;
}

/** The "?" button every dashboard page header carries — opens a structured what/why/how
 *  modal so no page's purpose is ever a mystery. Content lives in `lib/pageGuides.ts`. */
export function PageHelp({ guideKey, onStartTour }: PageHelpProps) {
  const guide = PAGE_GUIDES[guideKey];
  if (!guide) return null;

  return (
    <Dialog>
      <div className="flex items-center gap-1.5">
        {onStartTour && (
          <Button type="button" variant="outline" size="sm" onClick={onStartTour} className="gap-1.5">
            <Compass className="size-3.5" /> <span className="hidden sm:inline">Tour this page</span>
          </Button>
        )}
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="icon-sm" aria-label={`About ${guide.title}`}>
            <CircleHelp className="size-4" />
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="size-4.5 text-violet-300" />
            {guide.title}
          </DialogTitle>
          <DialogDescription>What this page does, why it exists, and how to use it.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          <GuideSection icon={CircleHelp} label="What it is" text={guide.what} />
          <GuideSection icon={Lightbulb} label="Why it works this way" text={guide.why} />
          <GuideSection icon={ListChecks} label="How to use it" text={guide.how} />
          {guide.tips && guide.tips.length > 0 && (
            <div className="rounded-lg border border-violet-400/20 bg-violet-400/5 p-3">
              <p className="mb-1.5 text-xs font-medium text-violet-300">Good to know</p>
              <ul className="flex flex-col gap-1 text-muted-foreground">
                {guide.tips.map((tip) => (
                  <li key={tip} className="flex gap-1.5">
                    <span className="text-violet-400">•</span> {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GuideSection({ icon: Icon, label, text }: { icon: React.ElementType; label: string; text: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-white/5 text-muted-foreground">
        <Icon className="size-3.5" />
      </div>
      <div>
        <p className="mb-0.5 text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-foreground/90">{text}</p>
      </div>
    </div>
  );
}
