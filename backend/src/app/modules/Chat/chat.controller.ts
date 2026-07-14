import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { ChatService } from './chat.service';

const askChat = catchAsync(async (req: Request, res: Response) => {
  const result = await ChatService.askChat(req.body, req.user!);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Chat reply generated successfully',
    data: result,
  });
});

export const ChatController = {
  askChat,
};
