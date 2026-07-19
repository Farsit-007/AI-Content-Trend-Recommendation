import { Router } from 'express';
import { requireSuperAdmin, requireAuth, requireTeamAccess, requireTeamAdmin } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { TeamController } from './team.controller';
import { TeamValidation } from './team.validation';

const router = Router();

router.use(requireAuth);

// Provisioning (create/delete a team outright) stays a platform-level, super_admin-only action.
// Managing an existing team's settings/members is team-scoped — see requireTeamAdmin below.
router.post('/', requireSuperAdmin, validation(TeamValidation.createTeamValidation), TeamController.createTeam);
router.get('/', TeamController.listTeams);
router.get('/:teamId', requireTeamAccess('teamId'), TeamController.getTeamById);
router.patch(
  '/:teamId',
  requireTeamAdmin('teamId'),
  validation(TeamValidation.updateTeamValidation),
  TeamController.updateTeam,
);
router.delete('/:teamId', requireSuperAdmin, TeamController.deleteTeam);

router.post(
  '/:teamId/members',
  requireTeamAdmin('teamId'),
  validation(TeamValidation.addMemberValidation),
  TeamController.addMember,
);
router.delete('/:teamId/members/:userId', requireTeamAdmin('teamId'), TeamController.removeMember);
router.patch(
  '/:teamId/members/:userId/role',
  requireTeamAdmin('teamId'),
  validation(TeamValidation.setMemberRoleValidation),
  TeamController.setMemberRole,
);

router.get('/:teamId/categories', requireTeamAccess('teamId'), TeamController.getCategories);
router.post(
  '/:teamId/categories',
  requireTeamAccess('teamId'),
  validation(TeamValidation.addCategoryValidation),
  TeamController.addCategory,
);
router.delete('/:teamId/categories/:category', requireTeamAccess('teamId'), TeamController.removeCategory);

export const TeamRoutes = router;
