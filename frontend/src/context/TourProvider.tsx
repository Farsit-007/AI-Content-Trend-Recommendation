import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth-context';
import { TourContext, type TourContextValue, type TourStep } from './tour-context';

const seenKey = (userId: string | undefined) => `gs-tour-welcome-seen:${userId ?? 'anon'}`;
const completedKey = (userId: string | undefined) => `gs-tour-completed:${userId ?? 'anon'}`;

function readCompleted(userId: string | undefined): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(completedKey(userId)) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    // A corrupt entry shouldn't brick the tour system — treat it as "nothing completed".
    return [];
  }
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  /** Id of the tour currently running, so it can be marked complete when it ends. */
  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  const [completedTours, setCompletedTours] = useState<string[]>(() => readCompleted(user?._id));
  const [hasSeenWelcome, setHasSeenWelcome] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(seenKey(user?._id)) === '1';
  });

  const markCompleted = useCallback(
    (tourId: string) => {
      setCompletedTours((prev) => {
        if (prev.includes(tourId)) return prev;
        const next = [...prev, tourId];
        localStorage.setItem(completedKey(user?._id), JSON.stringify(next));
        return next;
      });
    },
    [user?._id],
  );

  const startTour = useCallback((newSteps: TourStep[], tourId?: string) => {
    if (newSteps.length === 0) return;
    setSteps(newSteps);
    setStepIndex(0);
    setActiveTourId(tourId ?? null);
  }, []);

  /** Ends the run and records completion. Dismissing counts the same as finishing — otherwise the
   *  entry point keeps nagging someone who has already decided they don't want it. Both remain
   *  replayable from each page's help dialog. */
  const endTour = useCallback(() => {
    if (activeTourId) markCompleted(activeTourId);
    setSteps(null);
    setStepIndex(0);
    setActiveTourId(null);
  }, [activeTourId, markCompleted]);

  const next = useCallback(() => {
    if (!steps) return;
    if (stepIndex + 1 >= steps.length) {
      endTour();
      return;
    }
    setStepIndex(stepIndex + 1);
  }, [steps, stepIndex, endTour]);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const markWelcomeSeen = useCallback(() => {
    localStorage.setItem(seenKey(user?._id), '1');
    setHasSeenWelcome(true);
  }, [user?._id]);

  const isTourCompleted = useCallback((tourId: string) => completedTours.includes(tourId), [completedTours]);

  const value = useMemo<TourContextValue>(
    () => ({
      steps,
      stepIndex,
      startTour,
      stopTour: endTour,
      next,
      prev,
      hasSeenWelcome,
      markWelcomeSeen,
      isTourCompleted,
    }),
    [steps, stepIndex, startTour, endTour, next, prev, hasSeenWelcome, markWelcomeSeen, isTourCompleted],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
