import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { ContentGenerationController } from './contentGeneration.controller';
import { ContentGenerationValidation } from './contentGeneration.validation';

const router = Router();

router.use(requireAuth);

router.post(
  '/generate',
  validation(ContentGenerationValidation.generateContentValidation),
  ContentGenerationController.generateContent,
);

export const ContentGenerationRoutes = router;
