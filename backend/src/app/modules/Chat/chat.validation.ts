import { z } from 'zod';

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');

const askChatValidation = z.object({
  body: z.object({
    team_id: objectId,
    // Capped because an uncapped question is an uncapped bill: the whole body is forwarded to the
    // provider verbatim, so a pasted document costs real money on a request nobody reviewed.
    // 4000 characters is far more than a question needs and still an order of magnitude below the
    // context window.
    message: z
      .string({ required_error: 'message is required' })
      .min(1, 'message is required')
      .max(4000, 'message must be 4000 characters or fewer'),
    conversation_id: z.string().optional(),
    language: z.enum(['bangla', 'english']).optional(),
  }),
});

export const ChatValidation = {
  askChatValidation,
};
