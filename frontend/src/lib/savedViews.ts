/**
 * Named filter+sort combinations for the feed.
 *
 * Stored in `localStorage`, not the database. A saved view is a UI convenience holding no data of
 * its own — every field is a query parameter the user could retype — so a backend collection would
 * mean a model, validation, four endpoints, OpenAPI paths and tests for something whose entire value
 * is saving a few clicks. This follows the precedent already set by `TeamProvider` and the feed's
 * grid/table toggle.
 *
 * The honest cost: views do not follow a user across devices or browsers, and clearing site data
 * loses them. That is the trade being made deliberately — if they later need to be portable, the
 * shape below is already the request body a `saved_views` endpoint would take.
 *
 * Keyed per user id so two accounts sharing a browser do not see each other's views.
 */

export interface SavedView {
  id: string;
  name: string;
  category?: string;
  sort: string;
  searchTerm?: string;
}

const MAX_VIEWS = 12;

const storageKey = (userId: string): string => `growth-studio:saved-views:${userId}`;

/**
 * Every read is guarded. `localStorage` throws outright in a private window with site data blocked,
 * and a hand-edited or half-written value parses to anything at all — so a corrupt entry degrades to
 * "no saved views" rather than taking the feed down with it.
 */
export const loadSavedViews = (userId: string): SavedView[] => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as SavedView).id === 'string' &&
        typeof (v as SavedView).name === 'string' &&
        typeof (v as SavedView).sort === 'string',
    );
  } catch {
    return [];
  }
};

const persist = (userId: string, views: SavedView[]): SavedView[] => {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(views));
  } catch {
    // A full or blocked store means the view is not kept, but the caller still gets the updated
    // list so the current session behaves as though it were.
  }
  return views;
};

/**
 * Adds a view, replacing any existing one with the same name.
 *
 * Replacing rather than appending is what makes "save" idempotent: tweaking a filter and saving
 * under the same name should update that view, not leave two entries a user has to tell apart by
 * guessing.
 */
export const saveView = (userId: string, view: Omit<SavedView, 'id'>): SavedView[] => {
  const name = view.name.trim();
  const existing = loadSavedViews(userId).filter(
    (v) => v.name.toLowerCase() !== name.toLowerCase(),
  );
  const next: SavedView = {
    ...view,
    name,
    id: `sv_${Math.random().toString(36).slice(2, 10)}`,
  };
  // Newest first, and capped — an unbounded list would quietly grow into an unusable dropdown.
  return persist(userId, [next, ...existing].slice(0, MAX_VIEWS));
};

export const deleteSavedView = (userId: string, id: string): SavedView[] =>
  persist(
    userId,
    loadSavedViews(userId).filter((v) => v.id !== id),
  );
