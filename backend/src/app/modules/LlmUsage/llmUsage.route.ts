import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { LlmUsageController } from './llmUsage.controller';
import { LlmUsageValidation } from './llmUsage.validation';

const router = Router();

router.use(requireAuth);

// Read-only and cheap — it reads the daily rollup, not the event rows, so it is not behind the LLM
// rate limiter (that one exists to protect provider spend, and this endpoint spends nothing).
// Scope is enforced in the controller: a non-super-admin can only ever see their own team.
router.get(
  '/',
  validation(LlmUsageValidation.getUsageSummaryValidation),
  LlmUsageController.getSummary,
);

export const LlmUsageRoutes = router;
