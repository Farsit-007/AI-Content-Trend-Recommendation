import { TRole } from './user.interface';

export const Role: TRole[] = ['SUPER_ADMIN'];

export const USER_ROLE = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  MODARATOR: 'MODARATOR',
} as const;
