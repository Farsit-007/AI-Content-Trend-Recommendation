import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { UserController } from './user.controller';
import { UserValidation } from './user.validation';

// Authentication: /auth/login (public), /auth/me (any authenticated user).
const authRouter = Router();
authRouter.post('/login', validation(UserValidation.loginValidation), UserController.login);
authRouter.get('/me', requireAuth, UserController.getMe);
export const AuthRoutes = authRouter;

// User management: admin-only. Self-registration was removed — admins create every account.
const userRouter = Router();
userRouter.use(requireAuth, requireAdmin);
userRouter.post('/', validation(UserValidation.createUserValidation), UserController.createUser);
userRouter.get('/', UserController.listUsers);
export const UserRoutes = userRouter;
