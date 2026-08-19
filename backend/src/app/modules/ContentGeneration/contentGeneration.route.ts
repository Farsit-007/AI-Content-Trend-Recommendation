import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { llmRateLimiter } from '../../middleware/rateLimit';
import { validation } from '../../middleware/validation';
import { ContentGenerationController } from './contentGeneration.controller';
import { ContentGenerationValidation } from './contentGeneration.validation';

const router = Router();

router.use(requireAuth);

// Every route here spends provider credits — see middleware/rateLimit.ts.
router.use(llmRateLimiter);

router.post(
  '/generate',
  validation(ContentGenerationValidation.generateContentValidation),
  ContentGenerationController.generateContent,
);

router.post(
  '/refine',
  validation(ContentGenerationValidation.refineContentValidation),
  ContentGenerationController.refineContent,
);

export const ContentGenerationRoutes = router;
