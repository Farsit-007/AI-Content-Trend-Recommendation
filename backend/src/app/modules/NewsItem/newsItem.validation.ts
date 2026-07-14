import { z } from 'zod';

const engagementValidation = z.object({
  points: z.number().optional(),
  comments: z.number().optional(),
  stars_delta: z.number().optional(),
});

const createNewsItemValidation = z.object({
  body: z.object({
    source: z.string({ required_error: 'source is required' }),
    source_id: z.string({ required_error: 'source_id is required' }),
    content_hash: z.string({ required_error: 'content_hash is required' }),
    title: z.string({ required_error: 'title is required' }),
    url: z.string({ required_error: 'url is required' }).url(),
    snippet: z.string().optional(),
    published_at: z.coerce.date().optional(),
    engagement: engagementValidation.optional(),
    category: z.string().optional(),
    embedding: z.array(z.number()).length(1536).optional(),
  }),
});

const getAllNewsItemsValidation = z.object({
  query: z.object({
    team_id: z.string().optional(),
    search: z.string().optional(),
    category: z.string().optional(),
    sort: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

const updateNewsItemValidation = z.object({
  body: z.object({
    title: z.string().optional(),
    url: z.string().url().optional(),
    snippet: z.string().optional(),
    published_at: z.coerce.date().optional(),
    engagement: engagementValidation.optional(),
    trend_score: z.number().optional(),
    category: z.string().optional(),
    relevance_score: z.number().optional(),
    impact_note: z.string().optional(),
    opportunity_score: z.number().optional(),
    processed: z.boolean().optional(),
  }),
});

export const NewsItemValidation = {
  createNewsItemValidation,
  getAllNewsItemsValidation,
  updateNewsItemValidation,
};
