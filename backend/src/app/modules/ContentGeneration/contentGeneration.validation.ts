import { z } from 'zod';
import { FORMAT_IDS, TEXT_FORMAT_IDS } from './contentGeneration.formats';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');
const formatEnum = z.enum(FORMAT_IDS as unknown as [string, ...string[]]);
const textFormatEnum = z.enum(TEXT_FORMAT_IDS as unknown as [string, ...string[]]);

const generateContentValidation = z.object({
  body: z.object({
    team_id: objectId,
    topic: z.string({ required_error: 'topic is required' }).min(1, 'topic is required'),
    news_item_id: objectId.optional(),
    language: z.enum(['bangla', 'english']).optional(),
    style_pack_id: objectId.optional(),
    formats: z
      .array(formatEnum)
      .min(1)
      .max(5)
      .refine((formats) => new Set(formats).size === formats.length, 'formats must not contain duplicates')
      .optional(),
    regenerate: z.boolean().optional(),
    llm_model_id: objectId.optional(),
  }),
});

const refineContentValidation = z.object({
  body: z.object({
    team_id: objectId,
    format: textFormatEnum,
    current_text: z.string({ required_error: 'current_text is required' }).min(1).max(6000),
    instruction: z.string({ required_error: 'instruction is required' }).min(1).max(300),
    language: z.enum(['bangla', 'english']).optional(),
    style_pack_id: objectId.optional(),
    llm_model_id: objectId.optional(),
  }),
});

export const ContentGenerationValidation = {
  generateContentValidation,
  refineContentValidation,
};
