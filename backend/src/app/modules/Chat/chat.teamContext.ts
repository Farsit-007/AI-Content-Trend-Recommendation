import { LanguageStyle } from '../Team/team.interface';
import { Team } from '../Team/team.model';
import { NewsCategoryTaxonomy } from '../NewsCategoryTaxonomy/newsCategoryTaxonomy.model';
import { normalizeKey } from '../NewsCategoryTaxonomy/newsCategoryTaxonomy.service';

/**
 * Everything chat needs to know about *which team is asking*, resolved once per request.
 *
 * This exists because retrieval used to take no team at all: `fetchNewsContext(embedding)` searched
 * the whole `news_items` corpus, so two teams asking the same question got byte-identical context.
 * Access control was correct — the knowledge was not. Every retriever now takes one of these, and
 * the scope is part of the database query rather than a filter applied to results (the same rule the
 * feed already follows in `newsItem.service.ts`).
 */
export interface TeamChatContext {
  teamId: string;
  teamName: string;
  /** Exactly what the team subscribed to — fixed-six names and/or discovered fine-grained ones. */
  subscribedCategories: string[];
  /**
   * The broad groups those subscriptions roll up under, from `news_category_taxonomy`. Only used
   * by the tier-2 widening in `chat.retrieval.ts`: a team subscribed to the discovered category
   * "LLM Tooling" gets nothing from a literal match when the week's items are categorized "AI",
   * so the second tier searches the group. For a team subscribed only to fixed-six names this set
   * equals `subscribedCategories`, and the widening tier is skipped as a no-op.
   */
  broadGroups: string[];
  language: LanguageStyle;
  customInstructions?: string;
  defaultStylePackId?: string;
}

/**
 * Resolves the broad group of each subscribed category. A subscription with no taxonomy row (a
 * category deleted after a team subscribed to it) contributes nothing rather than throwing — the
 * team keeps its other subscriptions and tier 1 still matches on the literal name.
 */
const resolveBroadGroups = async (
  subscribedCategories: string[],
): Promise<string[]> => {
  if (subscribedCategories.length === 0) return [];

  const rows = await NewsCategoryTaxonomy.find({
    normalized_key: { $in: subscribedCategories.map(normalizeKey) },
  })
    .select('broad_group')
    .lean();

  return [...new Set(rows.map((row) => row.broad_group))];
};

/**
 * One Team read plus one taxonomy read per chat request. This deliberately supersedes
 * `resolveVoiceOptions` on the answering path — that helper reads the same Team document, and
 * doing both would be two round-trips for one document. The not-ready guidance path still uses
 * `resolveVoiceOptions`, because it never needs a scope.
 *
 * A missing team yields an empty scope rather than throwing: `assertTeamAccess` has already run, so
 * the only way to get here with no team is a deletion racing an in-flight request, and the correct
 * answer to that is "I have no data for this team", not a 500.
 */
export const resolveTeamChatContext = async (
  teamId: string,
  languageOverride?: LanguageStyle,
): Promise<TeamChatContext> => {
  const team = await Team.findById(teamId)
    .select('name subscribed_categories voice_profile default_style_pack_id')
    .lean()
    .catch(() => null);

  const subscribedCategories = team?.subscribed_categories ?? [];

  return {
    teamId,
    teamName: team?.name ?? 'this team',
    subscribedCategories,
    broadGroups: await resolveBroadGroups(subscribedCategories),
    language:
      languageOverride ?? team?.voice_profile?.default_language ?? 'bangla',
    customInstructions: team?.voice_profile?.custom_instructions || undefined,
    defaultStylePackId: team?.default_style_pack_id,
  };
};
