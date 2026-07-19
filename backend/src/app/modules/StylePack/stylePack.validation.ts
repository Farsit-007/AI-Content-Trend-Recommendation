import { z } from 'zod';

const slug = z
  .string({ required_error: 'slug is required' })
  .regex(/^[a-z0-9-]+$/, 'slug must contain only lowercase letters, numbers, and hyphens');

const language = z.enum(['bangla', 'english']);

const createStylePackValidation = z.object({
  body: z.object({
    name: z.string({ required_error: 'name is required' }).min(1),
    slug,
    description: z.string().optional(),
    language,
    tone_tags: z.array(z.string()).max(10).optional(),
    style_card: z.string().max(4000).optional(),
    is_active: z.boolean().optional(),
  }),
});

const updateStylePackValidation = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    slug: slug.optional(),
    description: z.string().optional(),
    language: language.optional(),
    tone_tags: z.array(z.string()).max(10).optional(),
    style_card: z.string().max(4000).optional(),
    is_active: z.boolean().optional(),
  }),
});

const listStylePacksValidation = z.object({
  query: z.object({
    include_inactive: z.enum(['true', 'false']).optional(),
  }),
});

const styleExampleShape = z.object({
  content: z.string({ required_error: 'content is required' }).min(1).max(8000),
  platform: z.enum(['facebook', 'linkedin', 'other']).optional(),
  source_ref: z.string().optional(),
  engagement_hint: z.string().optional(),
});

const createStyleExampleValidation = z.object({
  body: styleExampleShape,
});

const bulkCreateStyleExamplesValidation = z.object({
  body: z.object({
    items: z.array(styleExampleShape).min(1).max(100),
  }),
});

export const StylePackValidation = {
  createStylePackValidation,
  updateStylePackValidation,
  listStylePacksValidation,
  createStyleExampleValidation,
  bulkCreateStyleExamplesValidation,
};
