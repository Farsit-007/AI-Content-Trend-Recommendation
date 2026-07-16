import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { LinkedInOAuthController } from './linkedinOAuth.controller';
import { LinkedInOAuthValidation } from './linkedinOAuth.validation';

const router = Router();

// --- Unauthenticated route (the browser / LinkedIn arrive without our JWT) ---
// Callback is state-validated. Query params are read directly (the shared `validation` middleware
// only covers body/cookies, not query).
router.get('/callback', LinkedInOAuthController.callback);

// --- Authenticated routes (team member/admin) ---
// teamId arrives as a query param on GET/DELETE, so those are validated in the controller.
router.get('/connect', requireAuth, LinkedInOAuthController.connect);
router.get('/orgs', requireAuth, LinkedInOAuthController.orgs);
router.post(
  '/select-org',
  requireAuth,
  validation(LinkedInOAuthValidation.selectOrgValidation),
  LinkedInOAuthController.selectOrg,
);
router.delete('/', requireAuth, LinkedInOAuthController.disconnect);

export const LinkedInOAuthRoutes = router;
