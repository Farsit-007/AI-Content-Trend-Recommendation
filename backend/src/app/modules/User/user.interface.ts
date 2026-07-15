export type UserRole = 'super_admin' | 'admin' | 'user';

export interface IUser {
  email: string;
  password_hash: string;
  name: string;
  role: UserRole;
  /** Set on password change/reset — any JWT issued before this moment is rejected. */
  password_changed_at?: Date;
  created_at: Date;
}

export type TokenType = 'access' | 'refresh' | 'password_reset';

export interface IAuthPayload {
  id: string;
  email: string;
  /** Absent on legacy access tokens; refresh/reset tokens always carry it. */
  token_type?: TokenType;
  /** Standard JWT issued-at (seconds) — populated by jwt.verify. */
  iat?: number;
}

/** What `requireAuth` attaches to `req.user` — resolved fresh from the DB on every request. */
export interface IRequestUser extends IAuthPayload {
  role: UserRole;
  team_ids: string[];
}
