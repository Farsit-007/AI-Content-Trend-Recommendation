import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { StylePackController } from './stylePack.controller';
import { StylePackValidation } from './stylePack.validation';

const router = Router();

router.use(requireAuth);

router.post(
  '/',
  requireSuperAdmin,
  validation(StylePackValidation.createStylePackValidation),
  StylePackController.createPack,
);
router.get('/', StylePackController.listPacks);
router.get('/:id', StylePackController.getPackById);
router.patch(
  '/:id',
  requireSuperAdmin,
  validation(StylePackValidation.updateStylePackValidation),
  StylePackController.updatePack,
);
router.delete('/:id', requireSuperAdmin, StylePackController.deletePack);

router.post(
  '/:id/examples',
  requireSuperAdmin,
  validation(StylePackValidation.createStyleExampleValidation),
  StylePackController.addExample,
);
router.post(
  '/:id/examples/bulk',
  requireSuperAdmin,
  validation(StylePackValidation.bulkCreateStyleExamplesValidation),
  StylePackController.addExamplesBulk,
);
router.get('/:id/examples', StylePackController.listExamples);
router.delete('/:id/examples/:exampleId', requireSuperAdmin, StylePackController.deleteExample);

router.post('/:id/generate-card', requireSuperAdmin, StylePackController.generateCard);

export const StylePackRoutes = router;
