import AppError from '../../errors/AppError';
import { embed, embedBatch } from '../../lib/embeddings';
import { LLM_MODELS, chatCompletion } from '../../lib/llmClient';
import { httpStatus } from '../../utils/httpStatus';
import { UserRole } from '../User/user.interface';
import { IStyleExample, IStylePack } from './stylePack.interface';
import { StyleExample, StylePack } from './stylePack.model';

const MAX_CARD_INPUT_CHARS = 15000;
const MAX_BULK_EXAMPLES = 100;

const CARD_ANALYSIS_INSTRUCTION =
  'You are analyzing a corpus of real social media posts to produce a style card for an AI content generator. ' +
  'Write a concise (~300-word) style card describing, in prose, this specific pack of examples. Cover exactly these ' +
  'aspects: (1) tone & register, (2) sentence rhythm, (3) hook patterns (how posts open), (4) emoji policy, ' +
  '(5) Bangla/English code-switch habits, (6) call-to-action habits, and (7) three things this style never does. ' +
  'Write the card as plain prose a content generator can follow, not a bulleted checklist. Do not wrap the output ' +
  'in markdown fences or add commentary before/after — respond with only the card text.';

/** Evenly samples examples down to a total content budget so the LLM sees a representative slice, not just the first N. */
const sampleWithinBudget = (examples: { content: string }[], maxChars: number): string[] => {
  const total = examples.reduce((sum, e) => sum + e.content.length, 0);
  if (total <= maxChars) return examples.map((e) => e.content);

  const stride = Math.ceil(examples.length / Math.max(1, Math.floor(maxChars / (total / examples.length))));
  const sampled: string[] = [];
  let used = 0;
  for (let i = 0; i < examples.length && used < maxChars; i += stride) {
    const content = examples[i].content;
    sampled.push(content);
    used += content.length;
  }
  return sampled;
};

/** `content.trim()` with internal whitespace collapsed — the equality key for de-duplication. */
const normalizeContent = (content: string): string => content.trim().replace(/\s+/g, ' ');

const createPack = async (payload: Partial<IStylePack>) => {
  const result = await StylePack.create(payload);
  return result;
};

const listPacks = async (includeInactive: boolean, role: UserRole) => {
  const filter = includeInactive && role === 'super_admin' ? {} : { is_active: true };
  return StylePack.find(filter).sort('-created_at');
};

const getPackById = async (id: string) => {
  const pack = await StylePack.findById(id);
  if (!pack) {
    throw new AppError(httpStatus.NOT_FOUND, 'Style pack not found');
  }
  const example_count = await StyleExample.countDocuments({ style_pack_id: id });
  return { ...pack.toObject(), example_count };
};

const updatePack = async (id: string, payload: Partial<IStylePack>) => {
  const pack = await StylePack.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
  if (!pack) {
    throw new AppError(httpStatus.NOT_FOUND, 'Style pack not found');
  }
  return pack;
};

const deletePack = async (id: string) => {
  const pack = await StylePack.findByIdAndDelete(id);
  if (!pack) {
    throw new AppError(httpStatus.NOT_FOUND, 'Style pack not found');
  }
  await StyleExample.deleteMany({ style_pack_id: id });
  return pack;
};

const addExample = async (packId: string, payload: Partial<IStyleExample>) => {
  const pack = await StylePack.findById(packId);
  if (!pack) {
    throw new AppError(httpStatus.NOT_FOUND, 'Style pack not found');
  }

  const embedding = payload.embedding ?? (await embed(payload.content as string));
  const result = await StyleExample.create({ ...payload, style_pack_id: packId, embedding });
  return result;
};

const listExamples = async (packId: string, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [result, total] = await Promise.all([
    StyleExample.find({ style_pack_id: packId }).skip(skip).limit(limit).sort('-created_at'),
    StyleExample.countDocuments({ style_pack_id: packId }),
  ]);
  return { meta: { page, limit, total, totalPage: Math.ceil(total / limit) }, result };
};

const deleteExample = async (packId: string, exampleId: string) => {
  const result = await StyleExample.findOneAndDelete({ _id: exampleId, style_pack_id: packId });
  if (!result) {
    throw new AppError(httpStatus.NOT_FOUND, 'Style example not found');
  }
  return result;
};

/**
 * Shared by the CLI script (`scripts/generateStyleCard.ts`) and `POST /:id/generate-card` so the
 * two entry points can never drift: samples the pack's examples down to a token budget, asks the
 * LLM for a ~300-word style card, and persists it alongside freshness metadata (generated-at +
 * the example count it was generated from, which callers use to derive staleness without a
 * separately-maintained flag).
 */
const generateCardForPack = async (packId: string): Promise<string> => {
  const pack = await StylePack.findById(packId);
  if (!pack) {
    throw new AppError(httpStatus.NOT_FOUND, 'Style pack not found');
  }

  const examples = await StyleExample.find({ style_pack_id: packId }, { content: 1 });
  if (examples.length === 0) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Style pack has no examples — add examples before generating a card');
  }

  const sampled = sampleWithinBudget(examples, MAX_CARD_INPUT_CHARS);
  const corpus = sampled.map((content, i) => `Example ${i + 1}:\n${content}`).join('\n\n');

  const card = await chatCompletion({
    model: LLM_MODELS.standard,
    temperature: 0.3,
    messages: [
      { role: 'system', content: CARD_ANALYSIS_INSTRUCTION },
      { role: 'user', content: corpus },
    ],
  });

  const trimmedCard = card.trim();
  await StylePack.findByIdAndUpdate(packId, {
    style_card: trimmedCard,
    style_card_generated_at: new Date(),
    style_card_example_count: examples.length,
  });

  return trimmedCard;
};

/**
 * Bulk import: embeds every surviving item in one `embedBatch` call (never one HTTP call per
 * item) and skips whitespace-normalized duplicates against both the pack's existing examples and
 * earlier items in the same batch. Semantic/cosine near-dup detection is deliberately not used
 * here — two genuinely distinct posts about the same topic are valid corpus diversity, unlike
 * news-item dedup where the goal is collapsing the same story.
 */
const addExamplesBulk = async (
  packId: string,
  items: Partial<IStyleExample>[],
): Promise<{ created: number; skipped: number; total: number }> => {
  const pack = await StylePack.findById(packId);
  if (!pack) {
    throw new AppError(httpStatus.NOT_FOUND, 'Style pack not found');
  }
  if (items.length === 0 || items.length > MAX_BULK_EXAMPLES) {
    throw new AppError(httpStatus.BAD_REQUEST, `Bulk import accepts between 1 and ${MAX_BULK_EXAMPLES} items`);
  }

  const existing = await StyleExample.find({ style_pack_id: packId }, { content: 1 });
  const seen = new Set(existing.map((e) => normalizeContent(e.content)));

  const survivors: Partial<IStyleExample>[] = [];
  let skipped = 0;
  for (const item of items) {
    const key = normalizeContent(item.content as string);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    survivors.push(item);
  }

  if (survivors.length === 0) {
    return { created: 0, skipped, total: existing.length };
  }

  const embeddings = await embedBatch(survivors.map((item) => item.content as string));
  await StyleExample.insertMany(
    survivors.map((item, i) => ({ ...item, style_pack_id: packId, embedding: embeddings[i] })),
  );

  return { created: survivors.length, skipped, total: existing.length + survivors.length };
};

export const StylePackService = {
  createPack,
  listPacks,
  getPackById,
  updatePack,
  deletePack,
  addExample,
  addExamplesBulk,
  listExamples,
  deleteExample,
  generateCardForPack,
};
