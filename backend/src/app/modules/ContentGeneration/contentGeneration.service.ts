import AppError from '../../errors/AppError';
import { embed } from '../../lib/embeddings';
import { LLM_MODELS, chatCompletion } from '../../lib/llmClient';
import { resolveVoiceOptions } from '../../lib/voiceProfile';
import { httpStatus } from '../../utils/httpStatus';
import { NewsItem } from '../NewsItem/newsItem.model';
import { IRequestUser } from '../User/user.interface';
import { GenerateContentRequest, GeneratedContent, NewsItemContext } from './contentGeneration.interface';
import { buildMessages } from './contentGeneration.prompt';
import { parseGeneratedContent } from './contentGeneration.parse';
import { fetchTopBrandVoiceExamples, fetchTopPerformingPosts, hasBrandVoiceExamples } from './contentGeneration.retrieval';

const assertTeamAccess = (teamId: string, requestingUser: IRequestUser) => {
  if (requestingUser.role === 'admin' || requestingUser.role === 'super_admin') return;
  if (!requestingUser.team_ids.includes(teamId)) {
    throw new AppError(httpStatus.FORBIDDEN, 'You do not have access to this team');
  }
};

/** Soft-fail by design: a missing/invalid news_item_id falls back to embedding the topic text, not a request error. */
const resolveNewsItemContext = async (
  newsItemId: string | undefined,
): Promise<{ embedding?: number[]; context?: NewsItemContext }> => {
  if (!newsItemId) return {};

  const newsItem = await NewsItem.findById(newsItemId).catch(() => null);
  if (!newsItem) {
    console.warn(`[ContentGeneration] news_item_id "${newsItemId}" did not resolve — falling back to topic text`);
    return {};
  }

  return {
    embedding: newsItem.embedding,
    context: { category: newsItem.category, impact_note: newsItem.impact_note },
  };
};

const generateContent = async (
  payload: GenerateContentRequest,
  requestingUser: IRequestUser,
): Promise<GeneratedContent> => {
  assertTeamAccess(payload.team_id, requestingUser);

  const [{ embedding: newsItemEmbedding, context: newsContext }, voiceOptions] = await Promise.all([
    resolveNewsItemContext(payload.news_item_id),
    resolveVoiceOptions(payload.team_id, payload.language),
  ]);
  const topicEmbedding = newsItemEmbedding ?? (await embed(payload.topic));

  const coldStart = !(await hasBrandVoiceExamples(payload.team_id));
  const fewShotExamples = coldStart
    ? []
    : (
        await Promise.all([
          fetchTopBrandVoiceExamples(payload.team_id, topicEmbedding),
          fetchTopPerformingPosts(payload.team_id, topicEmbedding),
        ])
      ).flat();

  const messages = buildMessages(payload.topic, fewShotExamples, voiceOptions, newsContext);

  let raw: string;
  try {
    raw = await chatCompletion({ model: LLM_MODELS.content, messages, temperature: 0.7 });
  } catch (err) {
    console.error('[ContentGeneration] LLM call failed:', err instanceof Error ? err.message : err);
    throw new AppError(httpStatus.BAD_GATEWAY, 'Content generation failed — please try again');
  }

  const parsed = parseGeneratedContent(raw);
  if (!parsed) {
    console.error('[ContentGeneration] LLM response was not valid structured JSON');
    throw new AppError(httpStatus.BAD_GATEWAY, 'Content generation failed — please try again');
  }

  return { topic: payload.topic, ...parsed };
};

export const ContentGenerationService = {
  generateContent,
};
