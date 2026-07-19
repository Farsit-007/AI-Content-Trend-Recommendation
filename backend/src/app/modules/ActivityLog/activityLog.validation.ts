import { z } from 'zod';

const getActivityLogValidation = z.object({
  query: z.object({
    team_id: z.string({ required_error: 'team_id is required' }),
    action: z.string().optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

export const ActivityLogValidation = {
  getActivityLogValidation,
};
