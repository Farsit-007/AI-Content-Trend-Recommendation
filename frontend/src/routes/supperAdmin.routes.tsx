import { Cpu, Palette } from 'lucide-react';
import type { TUserPath } from '@/types';
import { AIProviders, StylePacks } from './lazyPages';
import { adminPaths } from './admin.routes';

/** Super admins get everything an admin has, plus exclusive curation of the shared style library
 *  and global control of the LLM provider/model registry. */
export const supperAdminPaths: TUserPath[] = [
  ...adminPaths,
  {
    name: 'Style Packs',
    path: 'admin/style-packs',
    element: <StylePacks />,
    icon: Palette,
    roles: ['super_admin'],
  },
  {
    name: 'AI Providers',
    path: 'admin/ai-providers',
    element: <AIProviders />,
    icon: Cpu,
    roles: ['super_admin'],
  },
];
