import { Router } from 'express';
import { validation } from '../../middleware/validation';
import { NewsItemController } from './newsItem.controller';
import { NewsItemValidation } from './newsItem.validation';

const router = Router();

router.post(
  '/',
  validation(NewsItemValidation.createNewsItemValidation),
  NewsItemController.createNewsItem,
);
router.get('/', NewsItemController.getAllNewsItems);
router.get('/:id', NewsItemController.getSingleNewsItem);
router.patch(
  '/:id',
  validation(NewsItemValidation.updateNewsItemValidation),
  NewsItemController.updateNewsItem,
);
router.delete('/:id', NewsItemController.deleteNewsItem);

export const NewsItemRoutes = router;
