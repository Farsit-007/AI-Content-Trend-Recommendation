import { useEffect, useState } from 'react';
import { Compass, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useTour } from '@/context/tour-context';
import { getDashboardPaths } from '@/routes';
import { sidebarItemsGenerator } from '@/utils/sidebarItemsGenerator';
import { buildSidebarTour } from '@/lib/tours';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Fires once per user (tracked in localStorage) on their first dashboard visit — offers the
 *  whole-system tour. Declining still marks it seen; the tour stays available any time via the
 *  Navbar's "Take a tour" button, so nothing here is a user's only chance to see it. */
export function WelcomeTourModal() {
  const { user } = useAuth();
  const { hasSeenWelcome, markWelcomeSeen, startTour } = useTour();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (hasSeenWelcome) return;
    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, [hasSeenWelcome]);

  const handleSkip = () => {
    markWelcomeSeen();
    setOpen(false);
  };

  const handleStart = () => {
    markWelcomeSeen();
    setOpen(false);
    const items = sidebarItemsGenerator(getDashboardPaths(user?.role));
    startTour(buildSidebarTour(items));
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleSkip()}>
      <DialogContent showCloseButton={false} className="max-w-md text-center sm:text-left">
        <DialogHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-violet-400/10 text-violet-300 sm:mx-0">
            <Compass className="size-6" />
          </div>
          <DialogTitle className="text-xl">Welcome to Growth Studio, {user?.name?.split(' ')[0]}!</DialogTitle>
          <DialogDescription>
            First time here? Take a 60-second tour of the sidebar so you know exactly where everything lives —
            you can always restart it later from the top bar.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2">
          <Button type="button" variant="ghost" onClick={handleSkip}>
            Skip for now
          </Button>
          <Button type="button" onClick={handleStart} className="btn-glow gap-2 bg-violet-600 hover:bg-violet-500">
            <Sparkles className="size-4" /> Take the tour
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
