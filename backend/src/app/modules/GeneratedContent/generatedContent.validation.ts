import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');

const listGeneratedContentValidation = z.object({
  query: z.object({
    team_id: objectId,
    status: z.enum(['draft', 'approved', 'dismissed']).optional(),
    source: z.enum(['auto', 'manual']).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const updateGeneratedContentValidation = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(['approved', 'dismissed'], {
      required_error: 'status is required',
      invalid_type_error: 'status must be "approved" or "dismissed"',
    }),
  }),
});

const triggerAutoGenerationValidation = z.object({
  body: z.object({
    team_id: objectId.optional(),
  }),
});

const youtubeIdeaValidation = z.object({
  title: z.string().min(1),
  hook: z.string().min(1),
  chapters: z.array(z.string()),
  thumbnail_concept: z.string().min(1),
});

const createDraftValidation = z.object({
  body: z.object({
    team_id: objectId,
    news_item_id: objectId.optional(),
    topic: z.string({ required_error: 'topic is required' }).min(1).max(300),
    formats: z
      .object({
        facebook_post: z.string().optional(),
        facebook_reel_script: z.string().optional(),
        linkedin_post: z.string().optional(),
        youtube_idea: youtubeIdeaValidation.optional(),
        caption: z.string().optional(),
      })
      .refine((formats) => Object.values(formats).some((value) => value !== undefined), {
        message: 'At least one format must be provided',
      }),
    model_used: z.string().optional(),
  }),
});

export const GeneratedContentValidation = {
  listGeneratedContentValidation,
  updateGeneratedContentValidation,
  triggerAutoGenerationValidation,
  createDraftValidation,
};
