import {
  Newspaper,
  Sparkles,
  BarChart3,
  MessageSquare,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import type { AuthUser } from '@/lib/api/types';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** If set, only users with one of these roles see the item. */
  roles?: AuthUser['role'][];
}

/** Primary navigation shown in the navbar. Order is the display order. */
export const navItems: NavItem[] = [
  { label: 'Feed', to: '/dashboard/feed', icon: Newspaper },
  { label: 'Generate', to: '/dashboard/generate', icon: Sparkles },
  { label: 'Report', to: '/dashboard/report', icon: BarChart3 },
  { label: 'Chat', to: '/dashboard/chat', icon: MessageSquare },
  {
    label: 'Admin',
    to: '/dashboard/admin',
    icon: Shield,
    roles: ['admin', 'super_admin'],
  },
];

/** Filter nav items by the current user's role. */
export function visibleNavItems(role: AuthUser['role'] | undefined): NavItem[] {
  return navItems.filter((item) => !item.roles || (role && item.roles.includes(role)));
}
