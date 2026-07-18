import { Router } from 'express';
import { requireAdmin, requireAuth, requireTeamAccess } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { TeamController } from './team.controller';
import { TeamValidation } from './team.validation';

const router = Router();

router.use(requireAuth);

router.post('/', requireAdmin, validation(TeamValidation.createTeamValidation), TeamController.createTeam);
router.get('/', TeamController.listTeams);
router.get('/:teamId', requireTeamAccess('teamId'), TeamController.getTeamById);
router.patch(
  '/:teamId',
  requireAdmin,
  validation(TeamValidation.updateTeamValidation),
  TeamController.updateTeam,
);
router.delete('/:teamId', requireAdmin, TeamController.deleteTeam);

router.post(
  '/:teamId/members',
  requireAdmin,
  validation(TeamValidation.addMemberValidation),
  TeamController.addMember,
);
router.delete('/:teamId/members/:userId', requireAdmin, TeamController.removeMember);

router.get('/:teamId/categories', requireTeamAccess('teamId'), TeamController.getCategories);
router.post(
  '/:teamId/categories',
  requireTeamAccess('teamId'),
  validation(TeamValidation.addCategoryValidation),
  TeamController.addCategory,
);
router.delete('/:teamId/categories/:category', requireTeamAccess('teamId'), TeamController.removeCategory);

export const TeamRoutes = router;
