import { LayoutDashboard, Newspaper, Sparkles, MessageSquare, History, Settings, UserCog, BookOpen } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import type { TUserPath } from '@/types/sidebar.type';
import {
  Account,
  ActivityLog,
  Chat,
  Feed,
  Guide,
  Overview,
  Studio,
  Team,
} from './lazyPages';

/** Sections available to every authenticated user. */
export const userPaths: TUserPath[] = [
  { name: 'Overview', index: true, element: <Overview />, icon: LayoutDashboard },
  { name: 'Feed', path: 'feed', element: <Feed />, icon: Newspaper },
  { name: 'Studio', path: 'studio', element: <Studio />, icon: Sparkles },
  { name: 'Chat', path: 'chat', element: <Chat />, icon: MessageSquare },
  { name: 'Team', path: 'settings/team', element: <Team />, icon: Settings },
  { name: 'Activity', path: 'activity', element: <ActivityLog />, icon: History },
  { name: 'Guide', path: 'guide', element: <Guide />, icon: BookOpen },
  { name: 'Account', path: 'account', element: <Account />, icon: UserCog },

  // Studio replaced these two pages. Kept as redirects rather than deleted: bookmarks, the command
  // palette, and "View drafts" links from older toasts all still point here, and a 404 is a worse
  // answer than the page they wanted. No `name`, which is the existing way to register a route
  // with no sidebar entry (see TUserPath).
  { path: 'generate', element: <Navigate to="/dashboard/studio?tab=compose" replace /> },
  { path: 'drafts', element: <Navigate to="/dashboard/studio?tab=library" replace /> },
];
