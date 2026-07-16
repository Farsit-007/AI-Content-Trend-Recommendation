import { z } from 'zod';

const connectValidation = z.object({
  query: z.object({
    teamId: z.string({ required_error: 'teamId is required' }).min(1),
  }),
});

// Callback query is loose on purpose — LinkedIn may send `error`/`error_description` instead of
// code/state, and the handler maps every shape to a frontend redirect rather than a 4xx.
const callbackValidation = z.object({
  query: z.object({
    code: z.string().optional(),
    state: z.string().optional(),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }),
});

const orgsValidation = z.object({
  query: z.object({
    teamId: z.string({ required_error: 'teamId is required' }).min(1),
  }),
});

const selectOrgValidation = z.object({
  body: z.object({
    teamId: z.string({ required_error: 'teamId is required' }).min(1),
    orgId: z.string({ required_error: 'orgId is required' }).min(1),
  }),
});

const disconnectValidation = z.object({
  query: z.object({
    teamId: z.string({ required_error: 'teamId is required' }).min(1),
  }),
});

export const LinkedInOAuthValidation = {
  connectValidation,
  callbackValidation,
  orgsValidation,
  selectOrgValidation,
  disconnectValidation,
};
