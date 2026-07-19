import { Router } from 'express';
import { requireSuperAdmin, requireAuth } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { GeneratedContentController } from './generatedContent.controller';
import { GeneratedContentValidation } from './generatedContent.validation';

const router = Router();

router.use(requireAuth);

router.get(
  '/',
  validation(GeneratedContentValidation.listGeneratedContentValidation),
  GeneratedContentController.list,
);

router.post(
  '/',
  validation(GeneratedContentValidation.createDraftValidation),
  GeneratedContentController.createDraft,
);

router.post(
  '/run',
  requireSuperAdmin,
  validation(GeneratedContentValidation.triggerAutoGenerationValidation),
  GeneratedContentController.triggerRun,
);

router.patch(
  '/:id',
  validation(GeneratedContentValidation.updateGeneratedContentValidation),
  GeneratedContentController.updateStatus,
);

export const GeneratedContentRoutes = router;
