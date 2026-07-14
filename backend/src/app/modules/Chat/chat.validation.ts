import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');

const askChatValidation = z.object({
  body: z.object({
    team_id: objectId,
    message: z.string({ required_error: 'message is required' }).min(1, 'message is required'),
    conversation_id: z.string().optional(),
    language: z.enum(['bangla', 'english', 'banglish']).optional(),
  }),
});

export const ChatValidation = {
  askChatValidation,
};
