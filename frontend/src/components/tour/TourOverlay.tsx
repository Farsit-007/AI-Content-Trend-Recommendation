import { useEffect, useLayoutEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';
import { useTour } from '@/context/tour-context';
import { Button } from '@/components/ui/button';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;
const TOOLTIP_WIDTH = 320;
const GAP = 14;

function measure(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top - PADDING, left: r.left - PADDING, width: r.width + PADDING * 2, height: r.height + PADDING * 2 };
}

/**
 * Full-screen spotlight + tooltip renderer for the active tour (from `TourContext`). Purely
 * narrated (Next/Prev/Skip) — the highlighted element isn't required to be clicked to advance,
 * so a step whose target has scrolled off-screen or hasn't mounted yet is skipped rather than
 * breaking the tour.
 */
export function TourOverlay() {
  const { steps, stepIndex, next, prev, stopTour } = useTour();
  // One piece of state, stamped with the step it was measured for. Previously `ready` was reset with
  // a synchronous `setReady(false)` at the top of the effect below, which is a cascading render —
  // stamping instead lets both `ready` and `rect` be *derived*, so switching steps invalidates the
  // old measurement automatically rather than needing an extra render to clear it.
  const [measured, setMeasured] = useState<{ key: string; rect: Rect | null } | null>(null);

  const step = steps?.[stepIndex] ?? null;
  const stepKey = step ? `${stepIndex}:${step.target}` : null;
  const ready = Boolean(stepKey && measured?.key === stepKey);
  const rect = ready ? (measured?.rect ?? null) : null;

  useEffect(() => {
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) {
      // Target isn't on screen (e.g. empty list) — skip forward automatically.
      const t = setTimeout(() => next(), 0);
      return () => clearTimeout(t);
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Waits out the smooth scroll before measuring, so the spotlight lands on the settled position.
    const t = setTimeout(() => setMeasured({ key: `${stepIndex}:${step.target}`, rect: measure(step.target) }), 320);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.target, stepIndex]);

  useLayoutEffect(() => {
    if (!step) return;
    const recompute = () => setMeasured({ key: `${stepIndex}:${step.target}`, rect: measure(step.target) });
    window.addEventListener('resize', recompute);
    window.addEventListener('scroll', recompute, true);
    return () => {
      window.removeEventListener('resize', recompute);
      window.removeEventListener('scroll', recompute, true);
    };
  }, [step, stepIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stopTour();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, stopTour]);

  if (!step || !steps) return null;

  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;

  let tooltipTop: number;
  let tooltipLeft: number;
  if (rect) {
    const spaceBelow = viewportH - (rect.top + rect.height);
    const placeBelow = spaceBelow > 200 || rect.top < 220;
    tooltipTop = placeBelow ? rect.top + rect.height + GAP : Math.max(GAP, rect.top - GAP - 190);
    tooltipLeft = Math.min(Math.max(rect.left, GAP), viewportW - TOOLTIP_WIDTH - GAP);
  } else {
    tooltipTop = viewportH / 2 - 90;
    tooltipLeft = viewportW / 2 - TOOLTIP_WIDTH / 2;
  }

  return (
    <div className="fixed inset-0 z-[100]" aria-modal role="dialog">
      {/* Click-catcher: keeps the rest of the app inert while a tour is running. */}
      <div className="fixed inset-0" onClick={stopTour} />

      {rect && ready && (
        <div
          className="pointer-events-none fixed rounded-lg border-2 border-violet-400 transition-all duration-300 ease-out"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgba(6,6,10,0.78), 0 0 24px 4px oklch(0.65 0.24 295 / 0.55)',
          }}
        />
      )}
      {!rect && <div className="fixed inset-0 bg-black/78" />}

      <div
        className="glass-card pointer-events-auto fixed flex flex-col gap-3 rounded-xl p-4 shadow-2xl transition-all duration-300 ease-out"
        style={{ top: tooltipTop, left: tooltipLeft, width: TOOLTIP_WIDTH }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-300">
            <Compass className="size-3.5" />
            Step {stepIndex + 1} of {steps.length}
          </div>
          <button type="button" onClick={stopTour} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div>
          <p className="font-semibold text-foreground">{step.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{step.content}</p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={stopTour} className="text-xs">
            Skip tour
          </Button>
          <div className="flex gap-1.5">
            {stepIndex > 0 && (
              <Button type="button" variant="outline" size="icon-sm" onClick={prev} aria-label="Previous step">
                <ArrowLeft className="size-3.5" />
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={next}
              className="gap-1"
            >
              {stepIndex + 1 === steps.length ? 'Finish' : 'Next'}
              {stepIndex + 1 !== steps.length && <ArrowRight className="size-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
