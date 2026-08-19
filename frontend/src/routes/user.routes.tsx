import { LayoutDashboard, Newspaper, Sparkles, MessageSquare, Inbox, History, Settings, UserCog, BookOpen } from 'lucide-react';
import type { TUserPath } from '@/types/sidebar.type';
import {
  Account,
  ActivityLog,
  Chat,
  Drafts,
  Feed,
  Generate,
  Guide,
  Overview,
  Team,
} from './lazyPages';

/** Sections available to every authenticated user. */
export const userPaths: TUserPath[] = [
  { name: 'Overview', index: true, element: <Overview />, icon: LayoutDashboard },
  { name: 'Feed', path: 'feed', element: <Feed />, icon: Newspaper },
  { name: 'Generate', path: 'generate', element: <Generate />, icon: Sparkles },
  { name: 'Drafts', path: 'drafts', element: <Drafts />, icon: Inbox },
  { name: 'Chat', path: 'chat', element: <Chat />, icon: MessageSquare },
  { name: 'Team', path: 'settings/team', element: <Team />, icon: Settings },
  { name: 'Activity', path: 'activity', element: <ActivityLog />, icon: History },
  { name: 'Guide', path: 'guide', element: <Guide />, icon: BookOpen },
  { name: 'Account', path: 'account', element: <Account />, icon: UserCog },
];
