import { Router } from 'express';
import { optionalAuth, requireAdmin, requireAuth } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { IngestionRunController } from '../IngestionRun/ingestionRun.controller';
import { NewsIngestionController } from '../NewsIngestion/newsIngestion.controller';
import { NewsItemCategoryOverrideController } from '../NewsItemCategoryOverride/newsItemCategoryOverride.controller';
import { NewsItemCategoryOverrideValidation } from '../NewsItemCategoryOverride/newsItemCategoryOverride.validation';
import { NewsItemController } from './newsItem.controller';
import { NewsItemValidation } from './newsItem.validation';

const router = Router();

router.post('/ingest', requireAuth, requireAdmin, NewsIngestionController.ingestNews);
// Must stay above the `/:id` routes below — otherwise Express matches "ingestion-runs" as an :id.
router.get('/ingestion-runs', requireAuth, requireAdmin, IngestionRunController.listRuns);

router.patch(
  '/:id/override',
  requireAuth,
  validation(NewsItemCategoryOverrideValidation.setOverrideValidation),
  NewsItemCategoryOverrideController.setOverride,
);
router.delete(
  '/:id/override',
  requireAuth,
  validation(NewsItemCategoryOverrideValidation.clearOverrideValidation),
  NewsItemCategoryOverrideController.clearOverride,
);

router.post(
  '/',
  requireAuth,
  requireAdmin,
  validation(NewsItemValidation.createNewsItemValidation),
  NewsItemController.createNewsItem,
);
router.get('/', optionalAuth, NewsItemController.getAllNewsItems);
router.get('/:id', optionalAuth, NewsItemController.getSingleNewsItem);
router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  validation(NewsItemValidation.updateNewsItemValidation),
  NewsItemController.updateNewsItem,
);
router.delete('/:id', requireAuth, requireAdmin, NewsItemController.deleteNewsItem);

export const NewsItemRoutes = router;
