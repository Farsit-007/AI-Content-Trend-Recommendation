import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { ReportController } from './report.controller';
import { ReportValidation } from './report.validation';

const router = Router();

router.use(requireAuth);

router.get('/', validation(ReportValidation.getReportValidation), ReportController.getReportHandler);

export const ReportRoutes = router;
