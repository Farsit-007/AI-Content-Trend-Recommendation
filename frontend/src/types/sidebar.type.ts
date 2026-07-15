import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { AuthUser } from '@/lib/api/types';

/** A single dashboard path — the source of truth for both a route and a sidebar item. */
export interface TUserPath {
  /** Display name shown in the sidebar. Omit to register a route with no sidebar entry. */
  name?: string;
  /** Path relative to the dashboard base (e.g. `feed`). Omit when `index` is true. */
  path?: string;
  /** Marks the dashboard index (`/dashboard`) route. */
  index?: boolean;
  /** The page element to render. */
  element?: ReactNode;
  /** Sidebar icon. */
  icon?: LucideIcon;
  /** If set, the route is guarded and only these roles may access it. */
  roles?: AuthUser['role'][];
}

/** A rendered sidebar entry. */
export interface TSidebarItem {
  key: string;
  label: string;
  to: string;
  /** Exact-match highlighting (used for the index route). */
  end?: boolean;
  icon?: LucideIcon;
}
