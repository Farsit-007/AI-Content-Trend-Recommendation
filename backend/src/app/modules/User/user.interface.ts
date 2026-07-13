export type UserRole = 'admin' | 'user';

export interface IUser {
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  created_at: Date;
}

export interface IAuthPayload {
  id: string;
  email: string;
}

/** What `requireAuth` attaches to `req.user` — resolved fresh from the DB on every request. */
export interface IRequestUser extends IAuthPayload {
  role: UserRole;
  team_ids: string[];
}
