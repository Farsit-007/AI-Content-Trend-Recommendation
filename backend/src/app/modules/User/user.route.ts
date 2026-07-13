import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { UserController } from './user.controller';
import { UserValidation } from './user.validation';

const router = Router();

router.post('/register', validation(UserValidation.registerValidation), UserController.register);
router.post('/login', validation(UserValidation.loginValidation), UserController.login);
router.get('/me', requireAuth, UserController.getMe);

export const UserRoutes = router;
