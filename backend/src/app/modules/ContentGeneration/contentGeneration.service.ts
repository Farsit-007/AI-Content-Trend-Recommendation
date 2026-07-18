import crypto from 'crypto';
import AppError from '../../errors/AppError';
import { embed } from '../../lib/embeddings';
import { LLM_MODELS, chatCompletion } from '../../lib/llmClient';
import { logger } from '../../lib/logger';
import { redis } from '../../lib/redis';
import { resolveVoiceOptions } from '../../lib/voiceProfile';
import { httpStatus } from '../../utils/httpStatus';
import { NewsItem } from '../NewsItem/newsItem.model';
import { StylePack } from '../StylePack/stylePack.model';
import { LanguageStyle } from '../Team/team.interface';
import { Team } from '../Team/team.model';
import { IRequestUser } from '../User/user.interface';
import { getOrExtractFactSheet } from './contentGeneration.facts';
import { CONTENT_FORMATS, DEFAULT_FORMATS, FormatId } from './contentGeneration.formats';
import {
  GenerateContentRequest,
  GeneratedContent,
  NewsItemContext,
  RefineContentRequest,
  YoutubeIdea,
} from './contentGeneration.interface';
import { buildMessages, buildRefineMessages, StyleContext } from './contentGeneration.prompt';
import { parseTextFormat, parseYoutubeIdea } from './contentGeneration.parse';
import {
  fetchTopBrandVoiceExamples,
  fetchTopStyleExamples,
  hasBrandVoiceExamples,
} from './contentGeneration.retrieval';
import config from '../../config';

const CONTENT_TTL = config.content_generation.cache_ttl_seconds;

type FormatValue = string | YoutubeIdea;

const buildCacheKey = (
  teamId: string,
  newsItemId: string | undefined,
  topic: string | undefined,
  language: LanguageStyle,
  packId: string | null,
  format: FormatId,
): string => {
  const item = newsItemId ?? crypto.createHash('sha256').update(topic ?? '').digest('hex');
  return `content:${teamId}:${item}:${language}:${packId ?? 'none'}:${format}`;
};

const assertTeamAccess = (teamId: string, requestingUser: IRequestUser) => {
  if (requestingUser.role === 'admin' || requestingUser.role === 'super_admin') return;
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

/** Soft-fail by design: a missing/invalid news_item_id falls back to embedding the topic text, not a request error. */
const resolveNewsItemContext = async (
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

const generateContent = async (
  payload: GenerateContentRequest,
  requestingUser: IRequestUser,
): Promise<GeneratedContent> => {
  assertTeamAccess(payload.team_id, requestingUser);

  const requestedFormats = payload.formats ?? DEFAULT_FORMATS;

  const [voiceOptions, stylePack] = await Promise.all([
    resolveVoiceOptions(payload.team_id, payload.language),
    resolveStylePack(payload.style_pack_id, payload.team_id),
  ]);
  const packId = stylePack ? (stylePack._id as { toString(): string }).toString() : null;

  const cacheKeysByFormat = new Map(
    requestedFormats.map((format) => [
      format,
      buildCacheKey(payload.team_id, payload.news_item_id, payload.topic, voiceOptions.language, packId, format),
    ]),
  );

  // regenerate: true skips cache reads entirely — every requested format is treated as a miss,
  // so the existing miss-handling path below naturally overwrites each format's cache entry.
  const cachedEntries = payload.regenerate
    ? requestedFormats.map((format) => [format, null] as const)
    : await Promise.all(
        requestedFormats.map(async (format) => {
          const cached = await redis.get(cacheKeysByFormat.get(format) as string);
          return [format, cached ? (JSON.parse(cached) as FormatValue) : null] as const;
        }),
      );

  const results: Partial<Record<FormatId, FormatValue>> = {};
  const misses: FormatId[] = [];
  for (const [format, value] of cachedEntries) {
    if (value !== null) {
      results[format] = value;
    } else {
      misses.push(format);
    }
  }

  if (misses.length > 0) {
    const { embedding: newsItemEmbedding, context: newsContext } = await resolveNewsItemContext(payload.news_item_id);
    const topicEmbedding = newsItemEmbedding ?? (await embed(payload.topic));

    const coldStart = !(await hasBrandVoiceExamples(payload.team_id));
    const fewShotExamples = coldStart ? [] : await fetchTopBrandVoiceExamples(payload.team_id, topicEmbedding);

    const styleContext: StyleContext | undefined = stylePack
      ? { card: stylePack.style_card, examples: await fetchTopStyleExamples(packId as string, topicEmbedding) }
      : undefined;

    const factSheet =
      payload.news_item_id && newsContext?.content && newsContext.content.length >= config.content_generation.facts_min_chars
        ? (await getOrExtractFactSheet(payload.news_item_id, payload.topic, newsContext.content)) ?? undefined
        : undefined;

    let missResults: [FormatId, FormatValue][];
    try {
      missResults = await Promise.all(
        misses.map(async (format) => {
          const messages = buildMessages(
            format,
            payload.topic,
            fewShotExamples,
            voiceOptions,
            newsContext,
            styleContext,
            factSheet,
          );
          const raw = await chatCompletion({ model: LLM_MODELS.content, messages, temperature: 0.7 });
          const parsed = parseFormatValue(format, raw);
          if (parsed === null) {
            throw new Error(`format "${format}" returned an unparseable response`);
          }
          return [format, parsed] as [FormatId, FormatValue];
        }),
      );
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, '[ContentGeneration] LLM call failed');
      throw new AppError(httpStatus.BAD_GATEWAY, 'Content generation failed — please try again');
    }

    await Promise.all(
      missResults.map(([format, value]) =>
        redis.setex(cacheKeysByFormat.get(format) as string, CONTENT_TTL, JSON.stringify(value)),
      ),
    );

    for (const [format, value] of missResults) {
      results[format] = value;
    }
  }

  return { topic: payload.topic, ...results } as GeneratedContent;
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
    raw = await chatCompletion({ model: LLM_MODELS.content, messages, temperature: 0.5 });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, '[ContentGeneration] Refine LLM call failed');
    throw new AppError(httpStatus.BAD_GATEWAY, 'Content refinement failed — please try again');
  }

  const revised = parseTextFormat(raw);
  if (revised === null) {
    logger.error('[ContentGeneration] Refine response was empty after parsing');
    throw new AppError(httpStatus.BAD_GATEWAY, 'Content refinement failed — please try again');
  }

  return { revised_text: revised };
};

export const ContentGenerationService = {
  generateContent,
  refineContent,
};
