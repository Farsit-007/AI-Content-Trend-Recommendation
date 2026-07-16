import { useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

interface AuroraBackgroundProps {
  className?: string;
}

/**
 * Animated violet→cyan gradient mesh. Three blurred blobs drift slowly (CSS
 * keyframes) behind foreground content. Motion is suppressed when the user
 * prefers reduced motion. Non-interactive.
 */
export function AuroraBackground({ className }: AuroraBackgroundProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 -z-20 overflow-hidden',
        className,
      )}
    >
      <div
        className={cn(
          'absolute -top-1/3 left-1/4 size-[45rem] rounded-full bg-violet-600/30 blur-3xl',
          !reduceMotion && 'animate-aurora-drift',
        )}
        style={{ animationDuration: '18s' }}
      />
      <div
        className={cn(
          'absolute top-1/4 -right-1/4 size-[40rem] rounded-full bg-cyan-500/20 blur-3xl',
          !reduceMotion && 'animate-aurora-drift',
        )}
        style={{ animationDuration: '22s', animationDelay: '-6s' }}
      />
      <div
        className={cn(
          'absolute -bottom-1/3 left-1/3 size-[38rem] rounded-full bg-fuchsia-500/20 blur-3xl',
          !reduceMotion && 'animate-aurora-drift',
        )}
        style={{ animationDuration: '26s', animationDelay: '-12s' }}
      />
    </div>
  );
}
