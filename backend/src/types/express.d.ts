import { IRequestUser } from '../app/modules/User/user.interface';

declare global {
  namespace Express {
    interface Request {
      user?: IRequestUser;
    }
  }
}

export {};
