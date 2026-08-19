import { NextFunction, Request, Response } from 'express';
import AppError from '../../errors/AppError';
import { openSseChannel, sendSseError, SseChannel } from '../../lib/sse';
import { catchAsync } from '../../utils/catchAsync';
import { httpStatus } from '../../utils/httpStatus';
import sendResponse from '../../utils/sendResponse';
import { ContentGenerationService } from './contentGeneration.service';

const generateContent = catchAsync(async (req: Request, res: Response) => {
  const result = await ContentGenerationService.generateContent(req.body, req.user!);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Content generated successfully',
    data: result,
  });
});

const refineContent = catchAsync(async (req: Request, res: Response) => {
  const result = await ContentGenerationService.refineContent(req.body, req.user!);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Content refined successfully',
    data: result,
  });
});

/**
 * SSE twin of `generateContent`. Not wrapped in `catchAsync` — once the stream's headers are written
 * the status is fixed at 200, so failures must reach the client as a terminal `error` event. Errors
 * raised before the channel opens still go to `next` and keep their proper status code.
 */
const generateContentStream = async (req: Request, res: Response, next: NextFunction) => {
  let channel: SseChannel | undefined;
  try {
    channel = openSseChannel(res);
    const active = channel;

    await ContentGenerationService.generateContentStream(req.body, req.user!, {
      onStart: (formats, modelUsed) => active.send('start', { formats, model_used: modelUsed }),
      onFormatDone: (format, value) => active.send('format', { format, value }),
      onFormatError: (format, message) => active.send('format_error', { format, message }),
      onDone: (result) => {
        active.send('done', result);
        active.close();
      },
      isCancelled: () => active.isClosed(),
    });
  } catch (err) {
    const message = err instanceof AppError ? err.message : 'Content generation failed — please try again';
    if (channel && !channel.isClosed()) {
      sendSseError(channel, message);
      return;
    }
    next(err);
  }
};

export const ContentGenerationController = {
  generateContent,
  generateContentStream,
  refineContent,
};
