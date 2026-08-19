import AppError from '../../errors/AppError';
import { chatCompletionForTask, resolveModelForTask } from '../../lib/modelResolution';
import { logger } from '../../lib/logger';
import { resolveVoiceOptions } from '../../lib/voiceProfile';
import { httpStatus } from '../../utils/httpStatus';
import { ActivityLogService } from '../ActivityLog/activityLog.service';
import { NewsItem } from '../NewsItem/newsItem.model';
import { StylePack } from '../StylePack/stylePack.model';
import { Team } from '../Team/team.model';
import { IRequestUser } from '../User/user.interface';
import { getOrEmbedTopic } from './contentGeneration.embedCache';
import { getOrExtractFactSheet } from './contentGeneration.facts';
import { CONTENT_FORMATS, DEFAULT_FORMATS, FormatId } from './contentGeneration.formats';
import {
  GenerateContentRequest,
  GeneratedContent,
  NewsItemContext,
  RefineContentRequest,
  YoutubeIdea,
} from './contentGeneration.interface';
import { critiqueText, isCritiqueEligible } from './contentGeneration.critique';
import { buildLanguageReinforcement, isLanguageMismatched } from './contentGeneration.languageGuard';
import { buildMessages, buildRefineMessages } from './contentGeneration.prompt';
import { parseTextFormat, parseYoutubeIdea } from './contentGeneration.parse';
import {
  buildStyleContext,
  fetchStylePackExamples,
  fetchTopBrandVoiceExamples,
  hasBrandVoiceExamples,
} from './contentGeneration.retrieval';
import config from '../../config';

type FormatValue = string | YoutubeIdea;

const assertTeamAccess = (teamId: string, requestingUser: IRequestUser) => {
  if (requestingUser.role === 'super_admin') return;
  if (!requestingUser.team_ids.includes(teamId)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not have access to this team');
  }
};

/**
 * Soft-fail resolution mirroring resolveVoiceOptions's request-override → team-default → none order,
 * but kept separate since resolveVoiceOptions is shared with Chat, which has no business knowing
 * about style packs. Any missing/inactive pack at either step logs a warning and falls through —
 * never a request error, matching resolveNewsItemContext's philosophy in this same file.
 */
const resolveStylePack = async (
  requestPackId: string | undefined,
  teamId: string,
): Promise<InstanceType<typeof StylePack> | null> => {
  if (requestPackId) {
    const pack = await StylePack.findById(requestPackId).catch(() => null);
    if (pack?.is_active) return pack;
    logger.warn(
      `[ContentGeneration] style_pack_id "${requestPackId}" did not resolve to an active pack — falling back to the team default`,
    );
  }

  const team = await Team.findById(teamId).select('default_style_pack_id').catch(() => null);
  const defaultPackId = team?.default_style_pack_id;
  if (!defaultPackId) return null;

  const teamPack = await StylePack.findById(defaultPackId).catch(() => null);
  if (!teamPack?.is_active) {
    logger.warn(`[ContentGeneration] team's default_style_pack_id "${defaultPackId}" did not resolve to an active pack`);
    return null;
  }
  return teamPack;
};

/**
 * Soft-fail by design: a missing/invalid news_item_id falls back to embedding the topic text, not
 * a request error. Exported (not just used internally) so the bake-off harness
 * (`contentGeneration.bakeoff.ts`) can resolve a topic's optional real news item exactly like a
 * live request does — it takes no team context at all, so nothing about reusing it here
 * team-scopes the harness.
 */
export const resolveNewsItemContext = async (
  newsItemId: string | undefined,
): Promise<{ embedding?: number[]; context?: NewsItemContext }> => {
  if (!newsItemId) return {};

  const newsItem = await NewsItem.findById(newsItemId).catch(() => null);
  if (!newsItem) {
    logger.warn(`[ContentGeneration] news_item_id "${newsItemId}" did not resolve — falling back to topic text`);
    return {};
  }

  return {
    embedding: newsItem.embedding,
    context: {
      category: newsItem.category,
      impact_note: newsItem.impact_note,
      snippet: newsItem.snippet,
      url: newsItem.url,
      content: newsItem.content,
      content_status: newsItem.content_status,
    },
  };
};

const parseFormatValue = (format: FormatId, raw: string): FormatValue | null =>
  CONTENT_FORMATS[format].kind === 'json' ? parseYoutubeIdea(raw) : parseTextFormat(raw);

/**
 * Everything a generation request needs before any format-specific work: voice, style pack, news
 * grounding, retrieval and the fact sheet.
 *
 * Extracted so the buffered and streaming entry points below cannot drift in *what* they generate,
 * only in how it is delivered. This codebase already learned that lesson once — see
 * `buildStyleContext`, pulled out so the bake-off harness could not silently diverge from a live
 * request's prompt.
 */
const prepareGeneration = async (payload: GenerateContentRequest) => {
  const requestedFormats = payload.formats ?? DEFAULT_FORMATS;

  const [voiceOptions, stylePack] = await Promise.all([
    resolveVoiceOptions(payload.team_id, payload.language),
    resolveStylePack(payload.style_pack_id, payload.team_id),
  ]);
  const packId = stylePack ? (stylePack._id as { toString(): string }).toString() : null;

  const { embedding: newsItemEmbedding, context: newsContext } = await resolveNewsItemContext(payload.news_item_id);
  const topicEmbedding = newsItemEmbedding ?? (await getOrEmbedTopic(payload.topic, payload.team_id));

  const coldStart = !(await hasBrandVoiceExamples(payload.team_id));
  const fewShotExamples = coldStart ? [] : await fetchTopBrandVoiceExamples(payload.team_id, topicEmbedding);

  // Fetched once regardless of how many formats are requested — each format ranks its own
  // selection from this shared set via rankStyleExamples's platform preference.
  const stylePackExamples = stylePack ? await fetchStylePackExamples(packId as string) : null;

  const factSheet =
    payload.news_item_id && newsContext?.content && newsContext.content.length >= config.content_generation.facts_min_chars
      ? (await getOrExtractFactSheet(payload.news_item_id, payload.topic, newsContext.content, payload.team_id)) ??
        undefined
      : undefined;

  const modelUsed = (
    await resolveModelForTask('content_generation', { teamId: payload.team_id, requestModelId: payload.llm_model_id })
  ).model_id;

  return {
    requestedFormats,
    voiceOptions,
    stylePack,
    stylePackExamples,
    topicEmbedding,
    fewShotExamples,
    factSheet,
    newsContext,
    modelUsed,
  };
};

type GenerationPrep = Awaited<ReturnType<typeof prepareGeneration>>;

/** Generates one format: prompt assembly, the LLM call, parsing, the language guard, and critique. */
const generateOneFormat = async (
  format: FormatId,
  prep: GenerationPrep,
  payload: GenerateContentRequest,
): Promise<FormatValue> => {
  const { voiceOptions, stylePack, stylePackExamples, topicEmbedding, fewShotExamples, factSheet, newsContext } = prep;

  const styleContext = buildStyleContext(format, stylePack, stylePackExamples, topicEmbedding);
  const messages = buildMessages(
    format,
    payload.topic,
    fewShotExamples,
    voiceOptions,
    newsContext,
    styleContext,
    factSheet,
  );

  const raw = await chatCompletionForTask('content_generation', messages, {
    teamId: payload.team_id,
    requestModelId: payload.llm_model_id,
    temperature: 0.7,
  });
  let parsed = parseFormatValue(format, raw);
  if (parsed === null) {
    throw new Error(`format "${format}" returned an unparseable response`);
  }

  // The languageDominance clause in buildSystemPrompt is a request, not a guarantee — models
  // reliably drift toward a few-shot example's language over a system instruction. This is the
  // hard backstop: detect the drift and retry once with a reinforced, last-position instruction
  // before ever handing back output in the wrong language. Soft-fail — a failed retry still
  // returns the best text we have, never a request error.
  if (typeof parsed === 'string' && isLanguageMismatched(parsed, voiceOptions.language)) {
    logger.warn(
      `[ContentGeneration] format "${format}" drifted from requested language "${voiceOptions.language}" — retrying once with a reinforced instruction`,
    );
    try {
      const retryRaw = await chatCompletionForTask(
        'content_generation',
        [...messages, { role: 'system', content: buildLanguageReinforcement(voiceOptions.language) }],
        { teamId: payload.team_id, requestModelId: payload.llm_model_id, temperature: 0.5 },
      );
      const retryParsed = parseFormatValue(format, retryRaw);
      if (retryParsed !== null) {
        parsed = retryParsed;
        if (typeof parsed === 'string' && isLanguageMismatched(parsed, voiceOptions.language)) {
          logger.warn(
            `[ContentGeneration] format "${format}" still mismatched requested language "${voiceOptions.language}" after retry — keeping it anyway`,
          );
        }
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : err },
        `[ContentGeneration] language-correction retry failed for format "${format}" — keeping original draft`,
      );
    }
  }

  // Critique is text-format-only, pack-gated, and off by default (isCritiqueEligible checks all of
  // that) — critiqueText itself soft-fails to `parsed` on any error or degenerate output, so this
  // can never turn a successful format into a failed one.
  return typeof parsed === 'string' && isCritiqueEligible(format, stylePack)
    ? await critiqueText(parsed, stylePack!.style_card, voiceOptions, payload.team_id)
    : parsed;
};

const logGenerated = (payload: GenerateContentRequest, requestingUser: IRequestUser, formats: FormatId[]) => {
  void ActivityLogService.recordActivity({
    team_id: payload.team_id,
    actor: requestingUser,
    action: 'content.generated',
    summary: `Generated ${formats.join(', ')} for "${payload.topic}"`,
    metadata: { formats, news_item_id: payload.news_item_id },
  });
};

/**
 * Every requested format always produces a fresh LLM call — creative output is not idempotent and
 * must not pretend to be (see generation-cache-rework). `regenerate` is accepted for API
 * compatibility with older clients but has no effect. Deterministic intermediates (fact sheets,
 * topic embeddings) remain cached — see contentGeneration.facts.ts / contentGeneration.embedCache.ts.
 *
 * All-or-nothing: one failed format fails the request. `generateContentStream` deliberately differs.
 */
const generateContent = async (
  payload: GenerateContentRequest,
  requestingUser: IRequestUser,
): Promise<GeneratedContent> => {
  assertTeamAccess(payload.team_id, requestingUser);

  const prep = await prepareGeneration(payload);
  const results: Partial<Record<FormatId, FormatValue>> = {};

  let formatResults: [FormatId, FormatValue][];
  try {
    formatResults = await Promise.all(
      prep.requestedFormats.map(
        async (format) => [format, await generateOneFormat(format, prep, payload)] as [FormatId, FormatValue],
      ),
    );
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, '[ContentGeneration] LLM call failed');
    throw new AppError(httpStatus.BAD_GATEWAY, 'Content generation failed — please try again');
  }

  for (const [format, value] of formatResults) {
    results[format] = value;
  }

  logGenerated(payload, requestingUser, prep.requestedFormats);

  return { topic: payload.topic, ...results, model_used: prep.modelUsed } as GeneratedContent;
};

export interface GenerationStreamHandlers {
  onStart: (formats: FormatId[], modelUsed: string) => void;
  onFormatDone: (format: FormatId, value: FormatValue) => void;
  onFormatError: (format: FormatId, message: string) => void;
  onDone: (result: GeneratedContent) => void;
  isCancelled: () => boolean;
}

/**
 * Streaming twin of `generateContent`, emitting each format as it completes.
 *
 * The problem it solves is not cosmetic: a five-format request is a fact-extraction call plus one
 * call per format plus an optional critique pass each — comfortably past a typical 30s proxy
 * timeout, at which point work that was paid for and completed is lost with nothing to show for it.
 *
 * Two deliberate differences from the buffered path:
 *  - **Per-format resilience.** A failed format emits `format_error` and the rest still land, rather
 *    than failing the whole request. Incremental delivery is pointless if one bad format discards
 *    four good ones the user already watched arrive.
 *  - **Cancellation.** Formats run sequentially so a client who navigates away stops the remaining
 *    paid calls. The buffered path runs them concurrently for total latency; here the latency that
 *    matters is time-to-*first*-format, which sequential delivery already minimises.
 */
const generateContentStream = async (
  payload: GenerateContentRequest,
  requestingUser: IRequestUser,
  handlers: GenerationStreamHandlers,
): Promise<void> => {
  assertTeamAccess(payload.team_id, requestingUser);

  const prep = await prepareGeneration(payload);
  handlers.onStart(prep.requestedFormats, prep.modelUsed);

  const results: Partial<Record<FormatId, FormatValue>> = {};
  const succeeded: FormatId[] = [];

  for (const format of prep.requestedFormats) {
    if (handlers.isCancelled()) {
      logger.info(`[ContentGeneration] client disconnected — skipping remaining formats after "${format}"`);
      return;
    }

    try {
      const value = await generateOneFormat(format, prep, payload);
      results[format] = value;
      succeeded.push(format);
      handlers.onFormatDone(format, value);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err: message, format }, '[ContentGeneration] format failed during streaming generation');
      handlers.onFormatError(format, `Could not generate ${format}. The other formats are unaffected.`);
    }
  }

  if (succeeded.length > 0) {
    logGenerated(payload, requestingUser, succeeded);
  }
  handlers.onDone({ topic: payload.topic, ...results, model_used: prep.modelUsed } as GeneratedContent);
};

const refineContent = async (
  payload: RefineContentRequest,
  requestingUser: IRequestUser,
): Promise<{ revised_text: string }> => {
  assertTeamAccess(payload.team_id, requestingUser);

  const [voiceOptions, stylePack] = await Promise.all([
    resolveVoiceOptions(payload.team_id, payload.language),
    resolveStylePack(payload.style_pack_id, payload.team_id),
  ]);

  const messages = buildRefineMessages(payload.current_text, payload.instruction, voiceOptions, stylePack?.style_card);

  let raw: string;
  try {
    raw = await chatCompletionForTask('content_generation', messages, {
      teamId: payload.team_id,
      requestModelId: payload.llm_model_id,
      temperature: 0.5,
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, '[ContentGeneration] Refine LLM call failed');
    throw new AppError(httpStatus.BAD_GATEWAY, 'Content refinement failed — please try again');
  }

  const revised = parseTextFormat(raw);
  if (revised === null) {
    logger.error('[ContentGeneration] Refine response was empty after parsing');
    throw new AppError(httpStatus.BAD_GATEWAY, 'Content refinement failed — please try again');
  }

  void ActivityLogService.recordActivity({
    team_id: payload.team_id,
    actor: requestingUser,
    action: 'content.refined',
    summary: `Refined the ${payload.format} draft ("${payload.instruction}")`,
    metadata: { format: payload.format },
  });

  return { revised_text: revised };
};

export const ContentGenerationService = {
  generateContent,
  generateContentStream,
  refineContent,
};
