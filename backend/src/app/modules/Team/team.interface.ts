export interface ITeam {
  name: string;
  description?: string;
  created_by: string;
  created_at: Date;
}

/** Join row for the many-to-many User<->Team relationship. */
export interface ITeamMembership {
  team_id: string;
  user_id: string;
  created_at: Date;
}
