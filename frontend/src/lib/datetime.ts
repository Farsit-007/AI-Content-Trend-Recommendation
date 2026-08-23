const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * "3 hours ago" / "2 days ago". Four copies of this logic had drifted across
 * ActivityLog, Overview, NewsCard, and NewsItemDialog; this is the one they share.
 */
export function timeAgo(iso: string | Date): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const deltaMinutes = Math.round(deltaMs / 60000);
  if (Math.abs(deltaMinutes) < 60) return relative.format(-deltaMinutes, 'minute');
  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) return relative.format(-deltaHours, 'hour');
  const deltaDays = Math.round(deltaHours / 24);
  if (Math.abs(deltaDays) < 30) return relative.format(-deltaDays, 'day');
  const deltaMonths = Math.round(deltaDays / 30);
  return relative.format(-deltaMonths, 'month');
}

/** Short absolute date, e.g. "22 Aug 2026" — for table cells where a relative time reads oddly. */
export function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Absolute date + time, for tooltips and run histories. */
export function formatDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "1m 24s" / "820ms" — run durations in the pipeline tables. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
