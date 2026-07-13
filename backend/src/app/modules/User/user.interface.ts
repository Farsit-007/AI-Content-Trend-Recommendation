export interface IUser {
  email: string;
  password_hash: string;
  name: string;
  created_at: Date;
}

export interface IAuthPayload {
  id: string;
  email: string;
}
