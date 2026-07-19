import { createContext, useContext } from 'react';

export interface TourStep {
  /** CSS selector for the element to spotlight. If not found when reached, the step is skipped. */
  target: string;
  title: string;
  content: string;
}

export interface TourContextValue {
  steps: TourStep[] | null;
  stepIndex: number;
  /** `tourId` opts the tour into completion tracking — once it ends, `isTourCompleted(tourId)`
   *  reports true and its entry points stop advertising themselves. */
  startTour: (steps: TourStep[], tourId?: string) => void;
  stopTour: () => void;
  next: () => void;
  prev: () => void;
  hasSeenWelcome: boolean;
  markWelcomeSeen: () => void;
  /** True once the user has run this tour to the end or dismissed it. Persisted per user. */
  isTourCompleted: (tourId: string) => boolean;
}

export const TourContext = createContext<TourContextValue | undefined>(undefined);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within a TourProvider');
  return ctx;
}
