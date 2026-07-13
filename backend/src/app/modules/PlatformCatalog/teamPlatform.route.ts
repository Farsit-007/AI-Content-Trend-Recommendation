import { Router } from 'express';
import { PlatformCatalogController } from './platformCatalog.controller';

// Mounted at /teams/:teamId/platforms by team.route.ts — mergeParams is required to see :teamId.
// Auth + team-access are already enforced by the parent router, not repeated here.
const router = Router({ mergeParams: true });

router.get('/', PlatformCatalogController.listTeamPlatforms);
router.post('/:platform/enable', PlatformCatalogController.enableForTeam);
router.post('/:platform/disable', PlatformCatalogController.disableForTeam);

export const TeamPlatformRoutes = router;
