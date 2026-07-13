import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { PlatformCatalogController } from './platformCatalog.controller';
import { PlatformCatalogValidation } from './platformCatalog.validation';

// Mounted at /platforms — the super_admin-curated list of platforms that exist in the system.
const router = Router();

router.use(requireAuth);

router.post(
  '/',
  requireSuperAdmin,
  validation(PlatformCatalogValidation.createPlatformValidation),
  PlatformCatalogController.createPlatform,
);
router.get('/', PlatformCatalogController.listPlatforms);
router.patch('/:name/enable', requireSuperAdmin, PlatformCatalogController.enablePlatform);
router.patch('/:name/disable', requireSuperAdmin, PlatformCatalogController.disablePlatform);
router.delete('/:name', requireSuperAdmin, PlatformCatalogController.deletePlatform);

export const PlatformCatalogRoutes = router;
