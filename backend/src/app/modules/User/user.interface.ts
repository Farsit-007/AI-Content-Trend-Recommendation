/* eslint-disable no-unused-vars */
import { Model } from 'mongoose';
import { USER_ROLE } from './user.constant';


export type TRole = 'SUPER_ADMIN';
export interface TUser {
  _id?: string;
  name: string;
  email: string;
  phone: string;
  passwordChangedAt?: Date;
  password: string;
  role: TRole;
  isBlock: boolean;
}

export interface UserModel extends Model<TUser> {
  isUserExists(email: string): Promise<TUser | null>;
  isPasswordMatched(
    plainTextPassword: string,
    hashedPassword: string,
  ): Promise<boolean>;
  isJWTIssuedBeforePasswordChanged(
    passwordChangedTimestamp: Date,
    jwtIssuedTimestamp: number,
  ): boolean;
}

export type TUserRole = keyof typeof USER_ROLE;
