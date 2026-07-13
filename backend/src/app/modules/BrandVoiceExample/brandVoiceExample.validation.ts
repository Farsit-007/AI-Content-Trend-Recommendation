import { z } from 'zod';

const createBrandVoiceExampleValidation = z.object({
  body: z.object({
    platform: z.string({ required_error: 'platform is required' }),
    category: z.string().optional(),
    content: z.string({ required_error: 'content is required' }),
    engagement_hint: z.string().optional(),
    added_by: z.string().optional(),
    embedding: z.array(z.number()).length(1536).optional(),
  }),
});

const updateBrandVoiceExampleValidation = z.object({
  body: z.object({
    platform: z.string().optional(),
    category: z.string().optional(),
    content: z.string().optional(),
    engagement_hint: z.string().optional(),
    added_by: z.string().optional(),
  }),
});

export const BrandVoiceExampleValidation = {
  createBrandVoiceExampleValidation,
  updateBrandVoiceExampleValidation,
};
