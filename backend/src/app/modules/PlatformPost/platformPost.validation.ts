import { z } from 'zod';

const metricsValidation = z.object({
  reach: z.number().optional(),
  likes: z.number().optional(),
  comments: z.number().optional(),
  shares: z.number().optional(),
  views: z.number().optional(),
});

const createPlatformPostValidation = z.object({
  body: z.object({
    platform: z.string({ required_error: 'platform is required' }),
    post_id: z.string({ required_error: 'post_id is required' }),
    content_snippet: z.string().optional(),
    metrics: metricsValidation.optional(),
    published_at: z.coerce.date().optional(),
    embedding: z.array(z.number()).length(1536).optional(),
  }),
});

const updatePlatformPostValidation = z.object({
  body: z.object({
    content_snippet: z.string().optional(),
    metrics: metricsValidation.optional(),
    published_at: z.coerce.date().optional(),
  }),
});

export const PlatformPostValidation = {
  createPlatformPostValidation,
  updatePlatformPostValidation,
};
