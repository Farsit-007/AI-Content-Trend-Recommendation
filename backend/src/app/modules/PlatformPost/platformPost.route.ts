import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { PlatformPostController } from './platformPost.controller';
import { PlatformPostValidation } from './platformPost.validation';

const router = Router();

router.use(requireAuth);

router.post(
  '/',
  validation(PlatformPostValidation.createPlatformPostValidation),
  PlatformPostController.createPlatformPost,
);
router.get('/', PlatformPostController.getAllPlatformPosts);
router.get('/:id', PlatformPostController.getSinglePlatformPost);
router.patch(
  '/:id',
  validation(PlatformPostValidation.updatePlatformPostValidation),
  PlatformPostController.updatePlatformPost,
);
router.delete('/:id', PlatformPostController.deletePlatformPost);

export const PlatformPostRoutes = router;
