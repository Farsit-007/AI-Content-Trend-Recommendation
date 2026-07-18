import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { StatsController } from './stats.controller';

const router = Router();

router.get('/overview', requireAuth, StatsController.getOverview);

export const StatsRoutes = router;
