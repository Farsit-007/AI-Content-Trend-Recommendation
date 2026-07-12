/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextFunction, Request, Response } from 'express';
import { catchAsync } from '../utils/catchAsync';

import jwt, { JwtPayload } from 'jsonwebtoken';
import config from '../config';
import { TUserRole } from '../modules/User/user.interface';
import { httpStatus } from '../utils/httpStatus';
import AppError from '../errors/AppError';
import { User } from '../modules/User/user.model';

export const auth = (...requiredRoles: TUserRole[]) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization;

    //Is the token send from the client
    if (!token) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized');
    }

    let decoded;
    try {
      //Check the Token is valid
      decoded = jwt.verify(
        token,
        config.jwt_access_secret as string,
      ) as JwtPayload;
    } catch (error) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'Unauthorized');
    }

    const { role, userEmail, iat,phone } = decoded;


    // checking if the user is exist
    const user = await User.isUserExists(userEmail);
    if (!user) {
      throw new AppError(httpStatus.NOT_FOUND, 'This user is not found');
    }

    // checking if the user is blocked
    const userStatus = user?.isBlock;
    if (userStatus) {
      throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked ! !');
    }

    if (
      user.passwordChangedAt &&
      User.isJWTIssuedBeforePasswordChanged(
        user.passwordChangedAt,
        iat as number,
      )
    ) {
      throw new AppError(
        httpStatus.UNAUTHORIZED,
        'You are not authorized!',
      );
    }


    if (requiredRoles && !requiredRoles.includes(role)) {
      throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized');
    }
    req.user = decoded as JwtPayload;
   
    next();
  });
};
