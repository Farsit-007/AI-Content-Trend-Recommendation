import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { BrandVoiceExampleController } from './brandVoiceExample.controller';
import { BrandVoiceExampleValidation } from './brandVoiceExample.validation';

const router = Router();

router.use(requireAuth);

router.post(
  '/',
  validation(BrandVoiceExampleValidation.createBrandVoiceExampleValidation),
  BrandVoiceExampleController.createBrandVoiceExample,
);
router.get('/', BrandVoiceExampleController.getAllBrandVoiceExamples);
router.get('/:id', BrandVoiceExampleController.getSingleBrandVoiceExample);
router.patch(
  '/:id',
  validation(BrandVoiceExampleValidation.updateBrandVoiceExampleValidation),
  BrandVoiceExampleController.updateBrandVoiceExample,
);
router.delete('/:id', BrandVoiceExampleController.deleteBrandVoiceExample);

export const BrandVoiceExampleRoutes = router;
