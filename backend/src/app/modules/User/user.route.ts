import { Router } from 'express';
import { requireSuperAdmin, requireAuth } from '../../middleware/auth';
import { authRateLimiter } from '../../middleware/rateLimit';
import { validation } from '../../middleware/validation';
import { UserController } from './user.controller';
import { UserValidation } from './user.validation';

// Authentication. Public: login, refresh-token, logout, forgot/reset password.
// Authenticated: me, change-password.
const authRouter = Router();
authRouter.post('/login', authRateLimiter, validation(UserValidation.loginValidation), UserController.login);
authRouter.post(
  '/refresh-token',
  authRateLimiter,
  validation(UserValidation.refreshTokenValidation),
  UserController.refreshToken,
);
authRouter.post('/logout', UserController.logout);
authRouter.post(
  '/change-password',
  requireAuth,
  validation(UserValidation.changePasswordValidation),
  UserController.changePassword,
);
authRouter.post(
  '/forgot-password',
  authRateLimiter,
  validation(UserValidation.forgotPasswordValidation),
  UserController.forgotPassword,
);
authRouter.post(
  '/reset-password',
  authRateLimiter,
  validation(UserValidation.resetPasswordValidation),
  UserController.resetPassword,
);
authRouter.get('/me', requireAuth, UserController.getMe);
export const AuthRoutes = authRouter;

// User management: admin-only. Self-registration was removed — admins create every account.
const userRouter = Router();
userRouter.use(requireAuth, requireSuperAdmin);
userRouter.post('/', validation(UserValidation.createUserValidation), UserController.createUser);
userRouter.get('/', UserController.listUsers);
// Closes the create-and-read-only gap: until now an account could be created but never renamed,
// re-roled, or removed, so the admin console could only ever grow.
userRouter.patch('/:id', validation(UserValidation.updateUserValidation), UserController.updateUser);
userRouter.delete('/:id', UserController.deleteUser);
export const UserRoutes = userRouter;
