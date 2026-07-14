import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');

const generateContentValidation = z.object({
  body: z.object({
    team_id: objectId,
    topic: z.string({ required_error: 'topic is required' }).min(1, 'topic is required'),
    news_item_id: objectId.optional(),
  }),
});

export const ContentGenerationValidation = {
  generateContentValidation,
};
