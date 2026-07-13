import { IAuthPayload } from '../app/modules/User/user.interface';

declare global {
  namespace Express {
    interface Request {
      user?: IAuthPayload;
    }
  }
}

export {};
