/** Only two global tiers: `super_admin` (full platform control) and `user` (everyone else).
 *  Team-scoped admin rights live on the membership row instead — see `ITeamMembership.role`. */
export type UserRole = 'super_admin' | 'user';

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
  name: string;
  role: UserRole;
  team_ids: string[];
  /** Subset of `team_ids` this user is `team_admin` of — see `requireTeamAdmin`. */
  team_admin_team_ids: string[];
}
