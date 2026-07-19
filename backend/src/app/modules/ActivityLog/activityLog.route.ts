import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { ActivityLogController } from './activityLog.controller';
import { ActivityLogValidation } from './activityLog.validation';

const router = Router();

// team_id is a query param here, not a :teamId route param, so team access is asserted inside
// the service (same pattern as GeneratedContent's listDrafts) rather than via requireTeamAccess,
// which only ever reads req.params.
router.get('/', requireAuth, validation(ActivityLogValidation.getActivityLogValidation), ActivityLogController.getActivityLog);

export const ActivityLogRoutes = router;
