import { Router } from 'express';
import express from 'express';
import { requireAuth } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { MetaOAuthController } from './metaOAuth.controller';
import { MetaOAuthValidation } from './metaOAuth.validation';

const router = Router();

// --- Unauthenticated routes (the browser / Meta arrive without our JWT) ---
// Callback is state-validated; data-deletion is signed-request-validated. Query params are read
// directly (the shared `validation` middleware only covers body/cookies, not query).
router.get('/callback', MetaOAuthController.callback);
router.post(
  '/data-deletion',
  express.urlencoded({ extended: true }),
  MetaOAuthController.dataDeletion,
);

// --- Authenticated routes (team member/admin) ---
// teamId arrives as a query param on GET/DELETE, so those are validated in the controller.
router.get('/connect', requireAuth, MetaOAuthController.connect);
router.get('/pages', requireAuth, MetaOAuthController.pages);
router.post(
  '/select-page',
  requireAuth,
  validation(MetaOAuthValidation.selectPageValidation),
  MetaOAuthController.selectPage,
);
router.delete('/', requireAuth, MetaOAuthController.disconnect);

export const MetaOAuthRoutes = router;
