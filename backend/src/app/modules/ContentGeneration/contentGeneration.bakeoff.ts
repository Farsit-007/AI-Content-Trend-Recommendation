/**
 * Offline bake-off harness core: drives the same style-conditioned prompt-assembly path as live
 * generation (via `buildStyleContext`, `resolveNewsItemContext`, `buildMessages`) across a
 * configurable matrix of candidate models, topics, and formats, with only the model id varying
 * from production. Deliberately never touches team-scoped brand-voice retrieval (see
 * bangla-quality-bakeoff-harness design.md decision 3) — few-shot examples are always empty, so the
 * comparison isolates model quality x style-pack quality, not a particular team's voice.
 *
 * `runBakeoffMatrix` is the only part with side effects (DB reads, LLM calls); shuffling and
 * formatting are pure so they're testable without a live DB or OpenRouter.
 */
import config from '../../config';
import { chatCompletion } from '../../lib/llmClient';
import {
  embedForTask,
  resolveProviderForLiteralModel,
} from '../../lib/modelResolution';
import { getAdapter } from '../LlmProvider/llmProvider.adapters';
import { LanguageStyle } from '../Team/team.interface';
import { StylePack } from '../StylePack/stylePack.model';
import { VoiceOptions } from '../../lib/voiceProfile';
import { FactSheet, getOrExtractFactSheet } from './contentGeneration.facts';
import { FormatId } from './contentGeneration.formats';
import { NewsItemContext } from './contentGeneration.interface';
import {
  critiqueText,
  isCritiqueStructurallyEligible,
} from './contentGeneration.critique';
import { buildMessages } from './contentGeneration.prompt';
import {
  buildStyleContext,
  fetchStylePackExamples,
} from './contentGeneration.retrieval';
import { resolveNewsItemContext } from './contentGeneration.service';

const MAX_MODELS = 4;
const MAX_TOPICS = 8;
const MAX_FORMATS = 2;
const DELAY_BETWEEN_CALLS_MS = 500;

export interface BakeoffTopic {
  topic: string;
  news_item_id?: string;
  /** Documentation only — never read by the harness; helps a human editing the topic file. */
  category_hint?: string;
}

export interface BakeoffCell {
  model: string;
  topic: string;
  format: FormatId;
  systemPrompt: string;
  userPrompt: string;
  output?: string;
  error?: string;
  latency_ms: number;
  /** True when this cell went through the critique-and-rewrite pass (style-fidelity-critique-pass). */
  critiqued: boolean;
}

export interface BakeoffRun {
  seed: number;
  startedAt: string;
  packSlug: string;
  cells: BakeoffCell[];
}

export interface RunBakeoffMatrixOptions {
  models: string[];
  topics: BakeoffTopic[];
  formats: FormatId[];
  packSlug: string;
  language?: LanguageStyle;
  seed?: number;
  /**
   * 'off' (default): today's behavior, one cell per (model, topic, format). 'both': for every cell
   * where the format/pack combination is structurally critique-eligible, additionally run the
   * critique pass on the successful output and record it as a second, independently-tagged cell —
   * so the enable/disable decision in BANGLA-QUALITY-DECISION.md can be made from paired evidence.
   * Note this can up to double the effective cell count within the existing MAX_MODELS/MAX_TOPICS/
   * MAX_FORMATS caps (those bound the pre-doubling matrix, not the final cell count).
   */
  critique?: 'off' | 'both';
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** mulberry32 — small, dependency-free, deterministic PRNG; good enough for blinding order, not for cryptography. */
const mulberry32 = (seed: number): (() => number) => {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

/** Deterministic Fisher-Yates shuffle — same seed always produces the same order, for exact reproduction of a run's blinding. */
export const shuffleWithSeed = <T>(items: T[], seed: number): T[] => {
  const rng = mulberry32(seed);
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Label carries no model information by construction — only its position in the shuffled order. */
export const labelForPosition = (position: number): string =>
  `Sample ${LETTERS[position % 26]}${Math.floor(position / 26) + 1}`;

interface TopicContext {
  topic: BakeoffTopic;
  topicEmbedding: number[];
  newsContext?: NewsItemContext;
  factSheet?: FactSheet;
}

/**
 * Runs the full model x topic x format matrix serially against the real prompt-assembly path.
 * Validates matrix caps before any DB or LLM call. Never throws mid-run on a single cell's
 * failure — each cell's error is captured on the cell itself so the rest of the run completes.
 */
export const runBakeoffMatrix = async (
  options: RunBakeoffMatrixOptions,
): Promise<BakeoffRun> => {
  const {
    models,
    topics,
    formats,
    packSlug,
    language = 'bangla',
    seed = Date.now(),
    critique = 'off',
  } = options;
  const startedAt = new Date().toISOString();

  if (models.length === 0 || models.length > MAX_MODELS) {
    throw new Error(
      `models must have between 1 and ${MAX_MODELS} entries (got ${models.length})`,
    );
  }
  if (topics.length === 0 || topics.length > MAX_TOPICS) {
    throw new Error(
      `topics must have between 1 and ${MAX_TOPICS} entries (got ${topics.length})`,
    );
  }
  if (formats.length === 0 || formats.length > MAX_FORMATS) {
    throw new Error(
      `formats must have between 1 and ${MAX_FORMATS} entries (got ${formats.length})`,
    );
  }

  const pack = await StylePack.findOne({ slug: packSlug, is_active: true });
  if (!pack) {
    throw new Error(`style pack "${packSlug}" not found or inactive`);
  }
  const packId = (pack._id as { toString(): string }).toString();
  const stylePackExamples = await fetchStylePackExamples(packId);

  const voiceOptions: VoiceOptions = { language };

  const topicContexts: TopicContext[] = [];
  for (const topic of topics) {
    const { embedding: newsItemEmbedding, context: newsContext } =
      await resolveNewsItemContext(topic.news_item_id);
    const topicEmbedding =
      newsItemEmbedding ?? (await embedForTask('embedding', topic.topic));
    const factSheet =
      topic.news_item_id &&
      newsContext?.content &&
      newsContext.content.length >= config.content_generation.facts_min_chars
        ? ((await getOrExtractFactSheet(
            topic.news_item_id,
            topic.topic,
            newsContext.content,
          )) ?? undefined)
        : undefined;
    topicContexts.push({ topic, topicEmbedding, newsContext, factSheet });
  }

  const cells: BakeoffCell[] = [];
  for (const model of models) {
    for (const topicContext of topicContexts) {
      for (const format of formats) {
        const styleContext = buildStyleContext(
          format,
          pack,
          stylePackExamples,
          topicContext.topicEmbedding,
        );
        const messages = buildMessages(
          format,
          topicContext.topic.topic,
          [],
          voiceOptions,
          topicContext.newsContext,
          styleContext,
          topicContext.factSheet,
        );
        const systemPrompt = messages[0]?.content ?? '';
        const userPrompt = messages[1]?.content ?? '';

        const cellStartedAt = Date.now();
        let baseOutput: string | undefined;
        try {
          // Deliberately NOT chatCompletionForTask — this harness compares caller-supplied literal
          // model strings against each other, so it only needs the right *provider* per model, not
          // task-based default resolution (design.md Non-Goals of llm-provider-task-resolution-and-ui).
          const routed = await resolveProviderForLiteralModel(model);
          // Bootstrap (catalog miss) delegates to the existing static chatCompletion — including its
          // own LLM_MODEL_FALLBACK retry — for true 100%-identical-to-today behavior when no LlmModel
          // catalog entry matches, exactly like chatCompletionForTask's bootstrap tier.
          baseOutput =
            routed.source === 'bootstrap'
              ? await chatCompletion({
                  model: routed.model_id,
                  messages,
                  temperature: 0.7,
                })
              : (
                  await getAdapter(
                    routed.provider_type,
                    routed.api_key,
                  ).chatCompletion(routed.model_id, messages, 0.7)
                ).content;
          cells.push({
            model,
            topic: topicContext.topic.topic,
            format,
            systemPrompt,
            userPrompt,
            output: baseOutput,
            latency_ms: Date.now() - cellStartedAt,
            critiqued: false,
          });
        } catch (err) {
          cells.push({
            model,
            topic: topicContext.topic.topic,
            format,
            systemPrompt,
            userPrompt,
            error: err instanceof Error ? err.message : String(err),
            latency_ms: Date.now() - cellStartedAt,
            critiqued: false,
          });
        }

        await sleep(DELAY_BETWEEN_CALLS_MS);

        // Only attempt a critiqued twin when the base generation actually succeeded — there's
        // nothing to critique from an errored cell. `critiqueText` itself never throws (it
        // soft-fails to the draft internally), so no separate try/catch is needed here.
        if (
          critique === 'both' &&
          baseOutput !== undefined &&
          isCritiqueStructurallyEligible(format, pack)
        ) {
          const critiqueStartedAt = Date.now();
          const critiquedOutput = await critiqueText(
            baseOutput,
            pack.style_card,
            voiceOptions,
          );
          cells.push({
            model,
            topic: topicContext.topic.topic,
            format,
            systemPrompt,
            userPrompt,
            output: critiquedOutput,
            latency_ms: Date.now() - critiqueStartedAt,
            critiqued: true,
          });

          await sleep(DELAY_BETWEEN_CALLS_MS);
        }
      }
    }
  }

  return { seed, startedAt, packSlug, cells };
};

const RUBRIC_HEADER =
  '| Bangla correctness /5 | Style fidelity /5 | AI-tell absence /5 | Factual grounding /5 | Publish with ≤2 edits? |';
const RUBRIC_DIVIDER = '|---|---|---|---|---|';
const RUBRIC_BLANK_ROW = '|  |  |  |  |  |';

/**
 * Pure formatter — the blinded review document. Every sample section is generated purely from its
 * position in `shuffledIndices`, never from `cell.model`, so there is no code path by which model
 * identity could leak into the text.
 */
export const formatReviewMarkdown = (
  run: BakeoffRun,
  shuffledIndices: number[],
): string => {
  const lines: string[] = [
    `# Bangla Quality Bake-off Review — ${run.startedAt}`,
    '',
    `Pack: \`${run.packSlug}\` — ${shuffledIndices.length} samples, blinded and shuffled. Do not infer the model from position, order, or writing quirks you think you recognize — score each sample on its own merits.`,
    '',
    'Rubric anchors (see docs/BANGLA-QUALITY-DECISION.md for full definitions):',
    '- **Bangla correctness** 5 = no conjunct/grammar errors a native reader trips on; 1 = broken Bangla throughout.',
    "- **Style fidelity** 5 = matches the pack's tone, rhythm, and register; 1 = generic, could be any style.",
    '- **AI-tell absence** 5 = you cannot point at a sentence and say "that\'s a bot"; 1 = obviously AI-written.',
    '- **Factual grounding** 5 = every claim matches the provided context; 1 = invents specifics.',
    '- **Publish with ≤2 edits?** A forced yes/no — the vision\'s own bar ("just click, tweak, copy paste").',
    '',
    '---',
  ];

  shuffledIndices.forEach((cellIndex, position) => {
    const cell = run.cells[cellIndex];
    const label = labelForPosition(position);
    lines.push(
      '',
      `## ${label}`,
      '',
      `**Format:** ${cell.format} · **Topic:** ${cell.topic}`,
      '',
    );
    lines.push(
      cell.error
        ? `_Generation failed: ${cell.error}_`
        : (cell.output ?? '_(no output)_'),
    );
    lines.push('', RUBRIC_HEADER, RUBRIC_DIVIDER, RUBRIC_BLANK_ROW, '', '---');
  });

  return lines.join('\n');
};

export interface LabelMapEntry {
  label: string;
  cell: BakeoffCell;
}

/** Maps each blinded label back to its true model/cell — the reviewer never sees this file. */
export const buildLabelMap = (
  run: BakeoffRun,
  shuffledIndices: number[],
): LabelMapEntry[] =>
  shuffledIndices.map((cellIndex, position) => ({
    label: labelForPosition(position),
    cell: run.cells[cellIndex],
  }));
