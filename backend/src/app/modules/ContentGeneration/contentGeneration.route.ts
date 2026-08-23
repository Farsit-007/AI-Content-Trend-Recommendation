import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { llmRateLimiter, llmTokenBudget } from '../../middleware/rateLimit';
import { validation } from '../../middleware/validation';
import { ContentGenerationController } from './contentGeneration.controller';
import { ContentGenerationValidation } from './contentGeneration.validation';

const router = Router();

router.use(requireAuth);

// Every route here spends provider credits — see middleware/rateLimit.ts.
router.use(llmRateLimiter, llmTokenBudget);

router.post(
  '/generate',
  validation(ContentGenerationValidation.generateContentValidation),
  ContentGenerationController.generateContent,
);

// Streaming twin of /generate — same auth, validation and per-team LLM budget, delivered over SSE
// with one event per completed format. Separate path rather than content-negotiated on /generate so
// the buffered endpoint stays byte-identical for existing clients.
router.post(
  '/generate/stream',
  validation(ContentGenerationValidation.generateContentValidation),
  ContentGenerationController.generateContentStream,
);

router.post(
  '/refine',
  validation(ContentGenerationValidation.refineContentValidation),
  ContentGenerationController.refineContent,
);

export const ContentGenerationRoutes = router;
