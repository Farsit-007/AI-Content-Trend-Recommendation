import express from 'express';
import { validation } from '../../middleware/validation';

import { AuthController } from './auth.controller';
import { auth } from '../../middleware/auth';
import { USER_ROLE } from '../User/user.constant';
import { changePasswordValidationSchema, loginValidationSchema, refreshTokenValidation } from './auth.zod';

const router = express.Router();
router.post(
  '/change-password',
  auth(USER_ROLE.SUPER_ADMIN, USER_ROLE.MODARATOR, USER_ROLE.ADMIN),
  validation(changePasswordValidationSchema),
  AuthController.changePassword,
);

router.post(
  '/login',
  validation(loginValidationSchema),
  AuthController.loginUser,
);

router.post(
  '/refresh-token',
  validation(refreshTokenValidation),
  AuthController.refreshToken,
);

export const AuthRoutes = router;
