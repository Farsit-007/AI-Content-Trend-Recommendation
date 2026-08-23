import config from '../../config';
import { cosineSimilarity } from '../../lib/similarity';
import { BrandVoiceExample } from '../BrandVoiceExample/brandVoiceExample.model';
import { GeneratedContent } from '../GeneratedContent/generatedContent.model';
import { IGeneratedContentFormats } from '../GeneratedContent/generatedContent.interface';
import { budgetContext, dedupeAgainstHistory } from './chat.budget';
import { ChatContextItem, ChatContextTier } from './chat.interface';
import { fetchNewsContext } from './chat.retrieval';
import { TeamChatContext } from './chat.teamContext';

const DRAFT_CONTEXT_LIMIT = 2;
const VOICE_CONTEXT_LIMIT = 2;
const DRAFT_EXCERPT_CHARS = 300;
const VOICE_EXCERPT_CHARS = 240;
const VOICE_POOL_CAP = 100;

/**
 * Reciprocal Rank Fusion constant. The standard 60 from the original RRF paper — large enough that
 * the difference between rank 1 and rank 2 doesn't dwarf a different retriever's rank 1.
 */
const RRF_K = 60;

/**
 * Per-retriever weight applied to the RRF contribution. News is the primary source — it is what the
 * product is for — so it outranks a same-rank draft. Brand voice is a style reference rather than a
 * fact source and is weighted lowest so it never crowds out substance.
 */
const SOURCE_WEIGHT: Record<'news' | 'drafts' | 'voice', number> = {
  news: 1,
  drafts: 0.7,
  voice: 0.4,
};

export interface TeamCorpusResult {
  /** Fused, ordered context. The `team_profile` block is always first. */
  context: ChatContextItem[];
  tier: ChatContextTier;
  diagnostics: {
    newsPoolSize: number;
    newsTopSimilarity: number;
    newsCount: number;
    draftCount: number;
    voiceCount: number;
    contextTokens: number;
    droppedForBudget: number;
  };
}

// ---------------------------------------------------------------------------------------------
// Drafts — lexical, because `generated_content` has no embedding column
// ---------------------------------------------------------------------------------------------

/**
 * Unicode-aware tokenizer. `\p{L}` rather than `[a-z]` because half this product's content is
 * Bangla, and an ASCII-only tokenizer would score every Bangla draft at exactly zero — which reads
 * as "we have never written about this" for the teams that write in Bangla most.
 */
export const tokenize = (text: string): string[] =>
  (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (token) => token.length > 1,
  );

const formatsToText = (formats: IGeneratedContentFormats): string =>
  [
    formats.facebook_post,
    formats.linkedin_post,
    formats.facebook_reel_script,
    formats.caption,
    formats.youtube_idea?.title,
    formats.youtube_idea?.hook,
  ]
    .filter(Boolean)
    .join('\n');

export interface DraftCandidate {
  _id?: unknown;
  topic: string;
  formats: IGeneratedContentFormats;
  status: string;
  created_at: Date;
}

/**
 * Ranks drafts by how much of the question's vocabulary they contain, length-normalized so a long
 * draft doesn't win on volume alone. Pure, so the leakage and relevance tests can drive it directly.
 *
 * A draft with **no** overlap scores 0 and is dropped rather than padding the prompt: an unrelated
 * draft in the context costs tokens and invites the model to cite it as if it were relevant.
 */
export const rankDraftsByQuestion = (
  candidates: DraftCandidate[],
  question: string,
  limit: number = DRAFT_CONTEXT_LIMIT,
): DraftCandidate[] => {
  const questionTokens = new Set(tokenize(question));
  if (questionTokens.size === 0) return [];

  return (
    candidates
      .map((draft) => {
        const draftTokens = tokenize(
          `${draft.topic}\n${formatsToText(draft.formats)}`,
        );
        if (draftTokens.length === 0) return { draft, score: 0 };
        const overlap = new Set(
          draftTokens.filter((token) => questionTokens.has(token)),
        ).size;
        return { draft, score: overlap / Math.sqrt(draftTokens.length) };
      })
      .filter((entry) => entry.score > 0)
      // Recency breaks a scoring tie — between two equally-relevant drafts, the newer one is the
      // better answer to "what have we written about this?".
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.draft.created_at.getTime() - a.draft.created_at.getTime(),
      )
      .slice(0, limit)
      .map((entry) => entry.draft)
  );
};

const draftToContextItem = (draft: DraftCandidate): ChatContextItem => ({
  source: 'draft',
  ref_id:
    draft._id === undefined || draft._id === null
      ? undefined
      : String(draft._id),
  label: draft.topic,
  content: [
    `Topic: ${draft.topic}`,
    `Status: ${draft.status}`,
    `Created: ${draft.created_at.toISOString().slice(0, 10)}`,
    `Excerpt: ${formatsToText(draft.formats).slice(0, DRAFT_EXCERPT_CHARS)}`,
  ].join('\n'),
});

const fetchDraftContext = async (
  question: string,
  teamId: string,
): Promise<ChatContextItem[]> => {
  const pool = await GeneratedContent.find({ team_id: teamId })
    .select('topic formats status created_at')
    .sort({ created_at: -1 })
    .limit(config.chat.draft_pool_cap)
    .lean();

  return rankDraftsByQuestion(
    pool as unknown as DraftCandidate[],
    question,
  ).map(draftToContextItem);
};

// ---------------------------------------------------------------------------------------------
// Brand voice — vector, because these do carry embeddings
// ---------------------------------------------------------------------------------------------

/**
 * Brand-voice examples only join the context when they clear `voice_min_similarity`.
 *
 * They are style references, not facts. Attaching two of a team's past posts to "what's trending in
 * AI this week?" spends tokens on text the model should not be drawing claims from, and invites it
 * to do exactly that. Gating on similarity keeps them out of factual questions and in for the ones
 * they answer — "does this match our voice?", "rewrite this the way we usually write".
 */
const fetchBrandVoiceContext = async (
  questionEmbedding: number[],
  teamId: string,
): Promise<ChatContextItem[]> => {
  const examples = await BrandVoiceExample.find({ team_id: teamId })
    .select('platform category content embedding')
    .limit(VOICE_POOL_CAP)
    .lean();

  return examples
    .map((example) => ({
      example,
      similarity: cosineSimilarity(questionEmbedding, example.embedding),
    }))
    .filter((entry) => entry.similarity >= config.chat.voice_min_similarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, VOICE_CONTEXT_LIMIT)
    .map(({ example }) => ({
      source: 'brand_voice' as const,
      ref_id: String(example._id),
      label: `${example.platform} example`,
      content: [
        `Platform: ${example.platform}`,
        example.category ? `Category: ${example.category}` : undefined,
        `Example (style reference, not a factual source): ${example.content.slice(0, VOICE_EXCERPT_CHARS)}`,
      ]
        .filter(Boolean)
        .join('\n'),
    }));
};

// ---------------------------------------------------------------------------------------------
// Team profile — synthesized, always present
// ---------------------------------------------------------------------------------------------

/**
 * A few lines describing the team itself, pinned to the front of every context and exempt from the
 * item budget. Without it, "what are we subscribed to?" and "why am I not seeing security news?"
 * are unanswerable from a corpus made only of retrieved documents — the answer lives on the team
 * record, not in any news item.
 */
const buildTeamProfileItem = (
  teamContext: TeamChatContext,
  draftCount: number,
): ChatContextItem => ({
  source: 'team_profile',
  ref_id: teamContext.teamId,
  label: teamContext.teamName,
  content: [
    `Team: ${teamContext.teamName}`,
    `Subscribed categories: ${
      teamContext.subscribedCategories.length > 0
        ? teamContext.subscribedCategories.join(', ')
        : 'none yet'
    }`,
    `Default language: ${teamContext.language}`,
    teamContext.customInstructions
      ? `Team instructions: ${teamContext.customInstructions}`
      : undefined,
    `Saved drafts: ${draftCount}`,
  ]
    .filter(Boolean)
    .join('\n'),
});

// ---------------------------------------------------------------------------------------------
// Fusion
// ---------------------------------------------------------------------------------------------

/**
 * Reciprocal Rank Fusion over the per-retriever ranked lists.
 *
 * Raw scores are not comparable across these retrievers — news similarity is cosine on 1536-d
 * embeddings, draft relevance is a length-normalized token overlap, brand voice is cosine over a
 * different corpus. Fusing on *rank* sidesteps the scale problem entirely, which is exactly what
 * RRF is for. Weights then express editorial priority (news > drafts > voice) rather than trying to
 * make three incompatible scales agree.
 */
export const fuseByRrf = (
  lists: { source: keyof typeof SOURCE_WEIGHT; items: ChatContextItem[] }[],
  limit: number,
): ChatContextItem[] => {
  const scored: { item: ChatContextItem; score: number }[] = [];

  for (const { source, items } of lists) {
    items.forEach((item, index) => {
      scored.push({ item, score: SOURCE_WEIGHT[source] / (RRF_K + index + 1) });
    });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
};

/**
 * The whole team-scoped corpus for one question.
 *
 * Every retriever below is scoped to `teamContext.teamId` inside its own query. There is no
 * unscoped read on this path and no post-fetch filtering — which is what
 * `__tests__/chat.teamScope.test.ts` asserts.
 */
export const buildTeamCorpus = async (
  question: string,
  questionEmbedding: number[],
  teamContext: TeamChatContext,
  /** Already-sent message text, so context the conversation carries is not paid for twice. */
  historyContents: string[] = [],
): Promise<TeamCorpusResult> => {
  const [news, drafts, voice, draftCount] = await Promise.all([
    fetchNewsContext(questionEmbedding, teamContext),
    fetchDraftContext(question, teamContext.teamId),
    fetchBrandVoiceContext(questionEmbedding, teamContext.teamId),
    GeneratedContent.countDocuments({ team_id: teamContext.teamId }),
  ]);

  const fused = fuseByRrf(
    [
      { source: 'news', items: news.context },
      { source: 'drafts', items: drafts },
      { source: 'voice', items: voice },
    ],
    config.chat.context_max_items,
  );

  // Order matters: drop what the conversation already carries *before* spending budget on it,
  // otherwise a duplicate passage can push a genuinely new item out of the prompt.
  const budgeted = budgetContext(
    dedupeAgainstHistory(fused, historyContents),
    config.chat.context_token_budget,
  );

  return {
    // The team profile is pinned outside the budget: it is a handful of lines and it is the only
    // thing that can answer "what are we subscribed to?".
    context: [buildTeamProfileItem(teamContext, draftCount), ...budgeted.items],
    tier: news.tier,
    diagnostics: {
      contextTokens: budgeted.approxTokens,
      droppedForBudget: budgeted.dropped,
      newsPoolSize: news.poolSize,
      newsTopSimilarity: news.topSimilarity,
      newsCount: news.context.length,
      draftCount: drafts.length,
      voiceCount: voice.length,
    },
  };
};
