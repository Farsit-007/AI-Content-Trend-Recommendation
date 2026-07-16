import { LayoutDashboard, Newspaper, Sparkles, BarChart3, MessageSquare, Plug } from 'lucide-react';
import type { TUserPath } from '@/types/sidebar.type';
import Overview from '@/pages/dashboard/Overview';
import Feed from '@/pages/dashboard/Feed';
import Generate from '@/pages/dashboard/Generate';
import Report from '@/pages/dashboard/Report';
import Chat from '@/pages/dashboard/Chat';
import Platforms from '@/pages/dashboard/settings/Platforms';

/** Sections available to every authenticated user. */
export const userPaths: TUserPath[] = [
  { name: 'Overview', index: true, element: <Overview />, icon: LayoutDashboard },
  { name: 'Feed', path: 'feed', element: <Feed />, icon: Newspaper },
  { name: 'Generate', path: 'generate', element: <Generate />, icon: Sparkles },
  { name: 'Report', path: 'report', element: <Report />, icon: BarChart3 },
  { name: 'Chat', path: 'chat', element: <Chat />, icon: MessageSquare },
  { name: 'Platforms', path: 'settings/platforms', element: <Platforms />, icon: Plug },
];
