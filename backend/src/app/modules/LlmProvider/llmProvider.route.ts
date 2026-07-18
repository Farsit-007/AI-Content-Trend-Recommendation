import { Router } from 'express';
import { requireAuth, requireSuperAdmin } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { LlmProviderController } from './llmProvider.controller';
import { LlmProviderValidation } from './llmProvider.validation';

// Global, platform-level registry — every route is super-admin-only, no team scoping (see
// design.md decision 4 of llm-provider-registry-foundation), except `GET /models/active` below:
// any authenticated user needs it to populate the Generate page's model picker.
const router = Router();

router.use(requireAuth);

// Any authenticated team member — not super-admin-only — needs the active model list to
// populate the Generate page's model picker (design.md decision 8 of
// llm-provider-task-resolution-and-ui). Registered before requireSuperAdmin is applied below.
router.get('/models/active', LlmProviderController.listActiveModels);

router.use(requireSuperAdmin);

router.get('/task-defaults', LlmProviderController.listTaskDefaults);
router.put(
  '/task-defaults/:task',
  validation(LlmProviderValidation.setTaskDefaultValidation),
  LlmProviderController.setTaskDefault,
);
router.delete(
  '/task-defaults/:task',
  validation(LlmProviderValidation.clearTaskDefaultValidation),
  LlmProviderController.clearTaskDefault,
);

router.post('/', validation(LlmProviderValidation.createProviderValidation), LlmProviderController.createProvider);
router.get('/', LlmProviderController.listProviders);
router.get('/:id', LlmProviderController.getProvider);
router.patch('/:id', validation(LlmProviderValidation.updateProviderValidation), LlmProviderController.updateProvider);
router.delete('/:id', LlmProviderController.deleteProvider);

router.post('/:id/keys', validation(LlmProviderValidation.addKeyValidation), LlmProviderController.addKey);
router.patch('/:id/keys/:keyId', validation(LlmProviderValidation.updateKeyValidation), LlmProviderController.updateKey);
router.delete('/:id/keys/:keyId', LlmProviderController.deleteKey);
router.post('/:id/keys/:keyId/reveal', LlmProviderController.revealKey);

router.post('/:id/models', validation(LlmProviderValidation.createModelValidation), LlmProviderController.createModel);
router.get('/:id/models', LlmProviderController.listModels);
router.patch('/:id/models/:modelId', validation(LlmProviderValidation.updateModelValidation), LlmProviderController.updateModel);
router.delete('/:id/models/:modelId', LlmProviderController.deleteModel);

export const LlmProviderRoutes = router;
