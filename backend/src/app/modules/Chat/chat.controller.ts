import { Request, Response } from 'express';
import AppError from '../../errors/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { ChatService } from './chat.service';

const requireTeamIdQuery = (req: Request): string => {
  const teamId = req.query.team_id;
  if (typeof teamId !== 'string' || !teamId) {
    throw new AppError(httpStatus.BAD_REQUEST, 'team_id query parameter is required');
  }
  return teamId;
};

const askChat = catchAsync(async (req: Request, res: Response) => {
  const result = await ChatService.askChat(req.body, req.user!);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chat reply generated successfully',
    data: result,
  });
});

const listConversations = catchAsync(async (req: Request, res: Response) => {
  const teamId = requireTeamIdQuery(req);
  const result = await ChatService.listConversations(teamId, req.user!);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversations retrieved successfully',
    data: result,
  });
});

const getConversationMessages = catchAsync(async (req: Request, res: Response) => {
  const teamId = requireTeamIdQuery(req);
  const result = await ChatService.getConversationMessages(teamId, req.params.conversationId as string, req.user!);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Conversation messages retrieved successfully',
    data: result,
  });
});

export const ChatController = {
  askChat,
  listConversations,
  getConversationMessages,
};
