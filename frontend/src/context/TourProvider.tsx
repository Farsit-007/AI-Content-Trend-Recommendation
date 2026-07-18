import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from './auth-context';
import { TourContext, type TourContextValue, type TourStep } from './tour-context';

const seenKey = (userId: string | undefined) => `gs-tour-welcome-seen:${userId ?? 'anon'}`;

export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [hasSeenWelcome, setHasSeenWelcome] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(seenKey(user?._id)) === '1';
  });

  const startTour = useCallback((newSteps: TourStep[]) => {
    if (newSteps.length === 0) return;
    setSteps(newSteps);
    setStepIndex(0);
  }, []);

  const stopTour = useCallback(() => {
    setSteps(null);
    setStepIndex(0);
  }, []);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (!steps) return i;
      if (i + 1 >= steps.length) {
        setSteps(null);
        return 0;
      }
      return i + 1;
    });
  }, [steps]);

  const prev = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const markWelcomeSeen = useCallback(() => {
    localStorage.setItem(seenKey(user?._id), '1');
    setHasSeenWelcome(true);
  }, [user?._id]);

  const value = useMemo<TourContextValue>(
    () => ({ steps, stepIndex, startTour, stopTour, next, prev, hasSeenWelcome, markWelcomeSeen }),
    [steps, stepIndex, startTour, stopTour, next, prev, hasSeenWelcome, markWelcomeSeen],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
