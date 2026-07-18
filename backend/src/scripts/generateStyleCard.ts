/**
 * Offline analysis: reads a style pack's examples, asks the LLM to produce a ~300-word style
 * card describing how the pack writes, and persists it to pack.style_card. Re-runnable anytime
 * (idempotent overwrite) — curators may also hand-write a card directly without this script.
 *
 * Run: npm run style:generate-card -- <slug>
 */
import dns from 'dns';
import mongoose from 'mongoose';
import config from '../app/config';

dns.setServers(['8.8.8.8', '1.1.1.1']);

import { LLM_MODELS, chatCompletion } from '../app/lib/llmClient';
import { StyleExample, StylePack } from '../app/modules/StylePack/stylePack.model';

const MAX_INPUT_CHARS = 15000;

const ANALYSIS_INSTRUCTION =
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

const [, , slug] = process.argv;

const main = async () => {
  if (!slug) {
    console.error('Usage: npm run style:generate-card -- <slug>');
    process.exit(1);
  }

  await mongoose.connect(config.database_url as string);

  const pack = await StylePack.findOne({ slug });
  if (!pack) {
    console.error(`[generateStyleCard] pack "${slug}" not found`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const examples = await StyleExample.find({ style_pack_id: (pack._id as mongoose.Types.ObjectId).toString() }, { content: 1 });
  if (examples.length === 0) {
    console.error(`[generateStyleCard] pack "${slug}" has no examples — seed it first`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const sampled = sampleWithinBudget(examples, MAX_INPUT_CHARS);
  const corpus = sampled.map((content, i) => `Example ${i + 1}:\n${content}`).join('\n\n');

  const card = await chatCompletion({
    model: LLM_MODELS.standard,
    temperature: 0.3,
    messages: [
      { role: 'system', content: ANALYSIS_INSTRUCTION },
      { role: 'user', content: corpus },
    ],
  });

  await StylePack.findByIdAndUpdate(pack._id, { style_card: card.trim() });

  console.log(`[generateStyleCard] pack "${pack.name}" (${slug}) — style card generated from ${sampled.length} example(s):\n`);
  console.log(card.trim());

  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('[generateStyleCard] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
