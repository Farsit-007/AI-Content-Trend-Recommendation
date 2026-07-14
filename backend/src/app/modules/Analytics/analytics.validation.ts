import { z } from 'zod';

const getAnalyticsValidation = z.object({
  query: z.object({
    team_id: z.string({ required_error: 'team_id is required' }),
  }),
});

const refreshAnalyticsValidation = z.object({
  body: z.object({
    team_id: z.string().optional(),
  }).optional(),
});

export const AnalyticsValidation = {
  getAnalyticsValidation,
  refreshAnalyticsValidation,
};
