import { LayoutDashboard, Newspaper, Sparkles, MessageSquare, UserCog } from 'lucide-react';
import type { TUserPath } from '@/types/sidebar.type';
import Overview from '@/pages/dashboard/Overview';
import Feed from '@/pages/dashboard/Feed';
import Generate from '@/pages/dashboard/Generate';
import Chat from '@/pages/dashboard/Chat';
import Account from '@/pages/dashboard/Account';

/** Sections available to every authenticated user. */
export const userPaths: TUserPath[] = [
  { name: 'Overview', index: true, element: <Overview />, icon: LayoutDashboard },
  { name: 'Feed', path: 'feed', element: <Feed />, icon: Newspaper },
  { name: 'Generate', path: 'generate', element: <Generate />, icon: Sparkles },
  { name: 'Chat', path: 'chat', element: <Chat />, icon: MessageSquare },
  { name: 'Account', path: 'account', element: <Account />, icon: UserCog },
];
