/**
 * Blinded model bake-off for Bangla content generation quality. Drives the real prompt-assembly
 * path (style pack resolution, style example retrieval, facts-then-write grounding, per-format
 * instructions) across a matrix of candidate models x topics x formats — only the model id differs
 * from a live request. Writes a machine-readable JSON of every cell and a blinded, shuffled
 * Markdown review document for a native-speaker reviewer. See docs/BANGLA-QUALITY-DECISION.md for
 * the scoring rubric and how to record the outcome once a real run against a real writer corpus
 * has happened (that's Gate G3 in 9-VISION-V7-V9-WRITER-STYLE-QUALITY-OPENSPEC-PLAN.md — this
 * script is the tool, not the decision itself).
 *
 * Run: npm run verify:bangla-bakeoff -- --models <id,id,...> --pack <slug> \
 *        [--topics-file <path>] [--formats facebook_post,linkedin_post] [--language bangla] [--seed <n>]
 */
import dns from 'dns';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import config from '../app/config';

dns.setServers(['8.8.8.8', '1.1.1.1']);

import { LanguageStyle } from '../app/modules/Team/team.interface';
import {
  BakeoffTopic,
  buildLabelMap,
  formatReviewMarkdown,
  runBakeoffMatrix,
  shuffleWithSeed,
} from '../app/modules/ContentGeneration/contentGeneration.bakeoff';
import { FormatId } from '../app/modules/ContentGeneration/contentGeneration.formats';

const DEFAULT_TOPICS_FILE = path.join(__dirname, '..', '..', 'seed', 'bakeoff-topics.json');
const DEFAULT_FORMATS: FormatId[] = ['facebook_post', 'linkedin_post'];
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'bakeoff-results');

const parseFlag = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
};

const parseList = (value: string | undefined): string[] | undefined =>
  value ? value.split(',').map((v) => v.trim()).filter(Boolean) : undefined;

const main = async () => {
  const models = parseList(parseFlag('--models'));
  const packSlug = parseFlag('--pack');
  const topicsFile = parseFlag('--topics-file') ?? DEFAULT_TOPICS_FILE;
  const formats = (parseList(parseFlag('--formats')) as FormatId[] | undefined) ?? DEFAULT_FORMATS;
  const language = (parseFlag('--language') as LanguageStyle | undefined) ?? 'bangla';
  const seedFlag = parseFlag('--seed');
  const seed = seedFlag ? Number(seedFlag) : Date.now();

  if (!models || models.length === 0 || !packSlug) {
    console.error(
      'Usage: npm run verify:bangla-bakeoff -- --models <id,id,...> --pack <slug> ' +
        '[--topics-file <path>] [--formats facebook_post,linkedin_post] [--language bangla] [--seed <n>]',
    );
    process.exit(1);
  }

  const topics = JSON.parse(readFileSync(topicsFile, 'utf8')) as BakeoffTopic[];

  await mongoose.connect(config.database_url as string);

  try {
    console.log(
      `[banglaBakeoff] running ${models.length} model(s) x ${topics.length} topic(s) x ${formats.length} format(s) ` +
        `= ${models.length * topics.length * formats.length} cells against pack "${packSlug}" (seed=${seed})`,
    );

    const run = await runBakeoffMatrix({ models, topics, formats, packSlug, language, seed });

    const shuffledIndices = shuffleWithSeed(
      run.cells.map((_, i) => i),
      seed,
    );
    const reviewMarkdown = formatReviewMarkdown(run, shuffledIndices);
    const labelMap = buildLabelMap(run, shuffledIndices);

    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
    const timestamp = run.startedAt.replace(/[:.]/g, '-');
    const jsonPath = path.join(OUTPUT_DIR, `bakeoff-${timestamp}.json`);
    const reviewPath = path.join(OUTPUT_DIR, `bakeoff-${timestamp}-review.md`);

    writeFileSync(jsonPath, JSON.stringify({ run, labelMap }, null, 2));
    writeFileSync(reviewPath, reviewMarkdown);

    const errored = run.cells.filter((c) => c.error).length;
    console.log(
      `[banglaBakeoff] done — ${run.cells.length} cells (${errored} errored). ` +
        `Review: ${reviewPath}\nData: ${jsonPath}\n` +
        'Hand the review file to a native-speaker reviewer. Do not show them the JSON (it reveals model identity).',
    );
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((err) => {
  console.error('[banglaBakeoff] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
