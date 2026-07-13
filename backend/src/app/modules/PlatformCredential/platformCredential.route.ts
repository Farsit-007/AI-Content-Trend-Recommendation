import { Router } from 'express';
import { validation } from '../../middleware/validation';
import { PlatformCredentialController } from './platformCredential.controller';
import { PlatformCredentialValidation } from './platformCredential.validation';

// Mounted at /teams/:teamId/credentials by team.route.ts — mergeParams is required to see :teamId.
// Auth + team-access are already enforced by the parent router, not repeated here.
const router = Router({ mergeParams: true });

router.post(
  '/',
  validation(PlatformCredentialValidation.upsertCredentialValidation),
  PlatformCredentialController.upsertCredential,
);
router.get('/', PlatformCredentialController.listCredentials);
router.get('/:platform/reveal', PlatformCredentialController.revealCredential);
router.delete('/:platform', PlatformCredentialController.deleteCredential);

export const PlatformCredentialRoutes = router;
