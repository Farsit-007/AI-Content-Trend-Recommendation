import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { TeamService } from './team.service';

const createTeam = catchAsync(async (req: Request, res: Response) => {
  const { name, description, member_ids } = req.body;
  const result = await TeamService.createTeam({ name, description }, member_ids ?? [], req.user!.id);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Team created successfully',
    data: result,
  });
});

const listTeams = catchAsync(async (req: Request, res: Response) => {
  const result = await TeamService.listTeams(req.user!);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Teams retrieved successfully',
    data: result,
  });
});

const getTeamById = catchAsync(async (req: Request, res: Response) => {
  const result = await TeamService.getTeamById(req.params.teamId as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Team retrieved successfully',
    data: result,
  });
});

const updateTeam = catchAsync(async (req: Request, res: Response) => {
  const result = await TeamService.updateTeam(req.params.teamId as string, req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Team updated successfully',
    data: result,
  });
});

const deleteTeam = catchAsync(async (req: Request, res: Response) => {
  const result = await TeamService.deleteTeam(req.params.teamId as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Team deleted successfully',
    data: result,
  });
});

const addMember = catchAsync(async (req: Request, res: Response) => {
  const result = await TeamService.addMember(req.params.teamId as string, req.body.user_id);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Member added to team successfully',
    data: result,
  });
});

const removeMember = catchAsync(async (req: Request, res: Response) => {
  const result = await TeamService.removeMember(req.params.teamId as string, req.params.userId as string);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Member removed from team successfully',
    data: result,
  });
});

export const TeamController = {
  createTeam,
  listTeams,
  getTeamById,
  updateTeam,
  deleteTeam,
  addMember,
  removeMember,
};
