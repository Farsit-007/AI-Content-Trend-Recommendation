import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsValidation } from './analytics.validation';

const router = Router();

router.use(requireAuth);

router.post('/refresh', requireAdmin, validation(AnalyticsValidation.refreshAnalyticsValidation), AnalyticsController.refresh);
router.get('/', validation(AnalyticsValidation.getAnalyticsValidation), AnalyticsController.getAnalytics);

export const AnalyticsRoutes = router;
