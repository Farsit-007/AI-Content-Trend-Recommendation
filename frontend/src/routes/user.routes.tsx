import { LayoutDashboard, Newspaper, Sparkles, FileText, MessageSquare, Users } from 'lucide-react';
import type { TUserPath } from '@/types/sidebar.type';
import Overview from '@/pages/dashboard/Overview';
import Feed from '@/pages/dashboard/Feed';
import Generate from '@/pages/dashboard/Generate';
import Drafts from '@/pages/dashboard/Drafts';
import Chat from '@/pages/dashboard/Chat';
import Team from '@/pages/dashboard/settings/Team';

/** Sections available to every authenticated user. */
export const userPaths: TUserPath[] = [
  { name: 'Overview', index: true, element: <Overview />, icon: LayoutDashboard },
  { name: 'Feed', path: 'feed', element: <Feed />, icon: Newspaper },
  { name: 'Generate', path: 'generate', element: <Generate />, icon: Sparkles },
  { name: 'Drafts', path: 'drafts', element: <Drafts />, icon: FileText },
  { name: 'Chat', path: 'chat', element: <Chat />, icon: MessageSquare },
  { name: 'Team', path: 'settings/team', element: <Team />, icon: Users },
];
