import { z } from 'zod';

const getReportValidation = z.object({
  query: z.object({
    team_id: z.string({ required_error: 'team_id is required' }),
    refresh: z.enum(['true', 'false']).optional(),
  }),
});

export const ReportValidation = {
  getReportValidation,
};
