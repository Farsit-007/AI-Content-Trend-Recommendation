import express from 'express';
import { UserController } from './user.controller';
import { validation } from '../../middleware/validation';
import { updateUserValidationSchema, userValidationSchema } from './user.zod';
import { USER_ROLE } from './user.constant';
import { auth } from '../../middleware/auth';

const router = express.Router();
router.post(
  '/',
  auth(USER_ROLE.SUPER_ADMIN),
  validation(userValidationSchema),
  UserController.createUser,
);
router.get('/', auth(USER_ROLE.SUPER_ADMIN), UserController.getAllUser);
router.patch(
  '/:id',
  auth(USER_ROLE.SUPER_ADMIN),
  validation(updateUserValidationSchema),
  UserController.updateUserRole,
);

router.delete(
  '/:id',
  auth(USER_ROLE.SUPER_ADMIN),
  UserController.deleteUser,
);

export const UserRoutes = router;
