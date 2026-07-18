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
  startTour: (steps: TourStep[]) => void;
  stopTour: () => void;
  next: () => void;
  prev: () => void;
  hasSeenWelcome: boolean;
  markWelcomeSeen: () => void;
}

export const TourContext = createContext<TourContextValue | undefined>(undefined);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within a TourProvider');
  return ctx;
}
