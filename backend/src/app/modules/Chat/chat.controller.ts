import { NextFunction, Request, Response } from 'express';
import { openSseChannel, sendSseError, SseChannel } from '../../lib/sse';
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

/**
 * SSE twin of `askChat`. Not wrapped in `catchAsync`: once the stream's headers are written the
 * status code is fixed at 200, so the global error handler cannot do anything useful — a failure has
 * to reach the client as a terminal `error` event instead. Errors raised *before* the channel opens
 * are still delegated to `next`, so an auth or validation failure keeps its proper status code.
 */
const askChatStream = async (req: Request, res: Response, next: NextFunction) => {
  let channel: SseChannel | undefined;
  try {
    channel = openSseChannel(res);
    const activeChannel = channel;

    await ChatService.askChatStream(req.body, req.user!, {
      onStart: (conversationId) => activeChannel.send('start', { conversation_id: conversationId }),
      onDelta: (text) => activeChannel.send('delta', { text }),
      onDone: (reply) => {
        activeChannel.send('done', { reply });
        activeChannel.close();
      },
      isCancelled: () => activeChannel.isClosed(),
    });
  } catch (err) {
    const message = err instanceof AppError ? err.message : 'Chat request failed — please try again';
    if (channel && !channel.isClosed()) {
      sendSseError(channel, message);
      return;
    }
    next(err);
  }
};

export const ChatController = {
  askChat,
  askChatStream,
  listConversations,
  getConversationMessages,
};
