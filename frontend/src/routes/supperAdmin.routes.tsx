import { Palette } from 'lucide-react';
import type { TUserPath } from '@/types';
import StylePacks from '@/pages/dashboard/admin/StylePacks';
import { adminPaths } from './admin.routes';

/** Super admins get everything an admin has, plus exclusive curation of the shared style library. */
export const supperAdminPaths: TUserPath[] = [
  ...adminPaths,
  {
    name: 'Style Packs',
    path: 'admin/style-packs',
    element: <StylePacks />,
    icon: Palette,
    roles: ['super_admin'],
  },
];
