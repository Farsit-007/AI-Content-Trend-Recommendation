import type { TUserPath } from '@/types';
import { adminPaths } from './admin.routes';

/** Super admins currently share the admin surface. Add super-admin-only
 *  sections here as they are built. */
export const supperAdminPaths: TUserPath[] = [...adminPaths];
