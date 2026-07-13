import { Schema, model } from 'mongoose';
import { IUser } from './user.interface';

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Never returned by a query unless a caller explicitly re-selects it (login does).
    password_hash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    created_at: { type: Date, default: Date.now },
  },
  {
    toJSON: {
      transform: (_doc, ret) => {
        delete (ret as Record<string, unknown>).password_hash;
        return ret;
      },
    },
  },
);

export const User = model<IUser>('User', userSchema, 'users');
