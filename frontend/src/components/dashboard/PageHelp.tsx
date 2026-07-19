import { useState } from 'react';
import { CircleHelp, Compass, Lightbulb, ListChecks, RotateCcw, Sparkles } from 'lucide-react';
import { PAGE_GUIDES } from '@/lib/pageGuides';
import { PAGE_TOURS } from '@/lib/tours';
import { useTour } from '@/context/tour-context';
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
}

/** The "?" button every dashboard page header carries — opens a structured what/why/how
 *  modal so no page's purpose is ever a mystery. Content lives in `lib/pageGuides.ts`.
 *
 *  It also owns this page's tour: `PAGE_TOURS` is keyed identically to `PAGE_GUIDES`, so the
 *  `guideKey` doubles as the tour id and every page gets its tour wired up for free. */
export function PageHelp({ guideKey }: PageHelpProps) {
  const [open, setOpen] = useState(false);
  const { startTour, isTourCompleted } = useTour();
  const guide = PAGE_GUIDES[guideKey];
  const tour = PAGE_TOURS[guideKey];

  if (!guide) return null;

  const hasTour = Boolean(tour?.length);
  const tourDone = hasTour && isTourCompleted(guideKey);

  const runTour = () => {
    // Close first: the tour spotlights elements on the page behind this modal, so leaving the
    // dialog open would cover the very thing being pointed at.
    setOpen(false);
    startTour(tour, guideKey);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="flex items-center gap-1.5">
        {/* Hidden once the tour has been run or dismissed — it stays replayable from inside the
            help dialog, so it stops taking up header space without becoming unreachable. */}
        {hasTour && !tourDone && (
          <Button type="button" variant="outline" size="sm" onClick={runTour} className="gap-1.5">
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
            <Sparkles className="size-4.5 text-violet-600 dark:text-violet-300" />
            {guide.title}
          </DialogTitle>
          <DialogDescription>What this page does, why it exists, and how to use it.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          <GuideSection icon={CircleHelp} label="What it is" text={guide.what} />
          <GuideSection icon={Lightbulb} label="Why it works this way" text={guide.why} />
          <GuideSection icon={ListChecks} label="How to use it" text={guide.how} />
          {guide.tips && guide.tips.length > 0 && (
            <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 dark:border-violet-400/20 dark:bg-violet-400/5">
              <p className="mb-1.5 text-xs font-medium text-violet-700 dark:text-violet-300">Good to know</p>
              <ul className="flex flex-col gap-1 text-muted-foreground">
                {guide.tips.map((tip) => (
                  <li key={tip} className="flex gap-1.5">
                    <span className="text-violet-600 dark:text-violet-400">•</span> {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {hasTour && (
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="button" variant="outline" size="sm" onClick={runTour} className="gap-1.5">
              {tourDone ? <RotateCcw className="size-3.5" /> : <Compass className="size-3.5" />}
              {tourDone ? 'Replay this page’s tour' : 'Tour this page'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function GuideSection({ icon: Icon, label, text }: { icon: React.ElementType; label: string; text: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </div>
      <div>
        <p className="mb-0.5 text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-foreground/90">{text}</p>
      </div>
    </div>
  );
}
