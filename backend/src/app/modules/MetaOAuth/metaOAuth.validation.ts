import { z } from 'zod';

const connectValidation = z.object({
  query: z.object({
    teamId: z.string({ required_error: 'teamId is required' }).min(1),
  }),
});

// Callback query is loose on purpose — Meta may send `error`/`error_reason` instead of code/state,
// and the handler maps every shape to a frontend redirect rather than a 4xx.
const callbackValidation = z.object({
  query: z.object({
    code: z.string().optional(),
    state: z.string().optional(),
    error: z.string().optional(),
    error_reason: z.string().optional(),
    error_description: z.string().optional(),
  }),
});

const pagesValidation = z.object({
  query: z.object({
    teamId: z.string({ required_error: 'teamId is required' }).min(1),
  }),
});

const selectPageValidation = z.object({
  body: z.object({
    teamId: z.string({ required_error: 'teamId is required' }).min(1),
    pageId: z.string({ required_error: 'pageId is required' }).min(1),
  }),
});

const disconnectValidation = z.object({
  query: z.object({
    teamId: z.string({ required_error: 'teamId is required' }).min(1),
  }),
});

export const MetaOAuthValidation = {
  connectValidation,
  callbackValidation,
  pagesValidation,
  selectPageValidation,
  disconnectValidation,
};
