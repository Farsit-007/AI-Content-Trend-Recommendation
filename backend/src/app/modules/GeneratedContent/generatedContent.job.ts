import { logger } from '../../lib/logger';
import config from '../../config';
import { IRequestUser } from '../User/user.interface';
import { ContentGenerationService } from '../ContentGeneration/contentGeneration.service';
import { NewsItem } from '../NewsItem/newsItem.model';
import { NewsItemTeamScoreService } from '../NewsItemTeamScore/newsItemTeamScore.service';
import { Team } from '../Team/team.model';
import { TeamService } from '../Team/team.service';
import { IAutoGenerationSummary, IGeneratedContentFormats } from './generatedContent.interface';
import { assertHasAtLeastOneFormat } from './generatedContent.utils';
import { GeneratedContent } from './generatedContent.model';

const TOP_NEWS_PER_TEAM = 3;

const makeAdminUser = (teamId: string): IRequestUser => ({
  id: 'system',
  email: 'system@growth-studio.internal',
  name: 'Growth Studio (auto-generation)',
  role: 'super_admin',
  team_ids: [teamId],
  team_admin_team_ids: [teamId],
});

export const runAutoGeneration = async (teamId?: string): Promise<IAutoGenerationSummary> => {
  const summary: IAutoGenerationSummary = { teams_processed: 0, drafts_created: 0, skipped: 0 };
  const maxRun = config.auto_generation.max_per_run;
  let callsUsed = 0;

  const teamsQuery = teamId ? Team.find({ _id: teamId }) : Team.find();
  const teams = await teamsQuery.select('_id name subscribed_categories').lean();
  const maxAgeHours = config.auto_generation.max_age_hours;

  for (const team of teams) {
    const tid = team._id.toString();

    try {
      const ready = await TeamService.isTeamReady(tid);
      if (!ready) {
        logger.info(`[auto-gen] team "${team.name}" (${tid}): skipped — team not ready (needs subscribed categories + brand voice examples)`);
        summary.skipped += 1;
        continue;
      }

      // Ranked by *this team's* opportunity score, not the shared one. This is the call that decides
      // what the team wakes up to every morning, so scoring it against a pool of every team's brand
      // voice — as this did before `news_item_team_scores` existed — meant a team's daily drafts could
      // be chosen by how well items matched somebody else's voice. Falls back to the stored baseline
      // for any item this team has no score for yet (see rankItemIdsForTeam).
      const newsFilter = {
        ...(team.subscribed_categories.length ? { category: { $in: team.subscribed_categories } } : {}),
        created_at: { $gte: new Date(Date.now() - maxAgeHours * 3600 * 1000) },
        lifecycle: 'active',
      };
      const rankedIds = await NewsItemTeamScoreService.rankItemIdsForTeam(
        newsFilter,
        tid,
        0,
        TOP_NEWS_PER_TEAM,
        true,
      );
      const unordered = await NewsItem.find({ _id: { $in: rankedIds } })
        .select('_id title category impact_note')
        .lean();
      const newsById = new Map(unordered.map((n) => [n._id.toString(), n]));
      const topNews = rankedIds
        .map((id) => newsById.get(id.toString()))
        .filter((n): n is NonNullable<typeof n> => Boolean(n));

      let teamDrafts = 0;
      for (const newsItem of topNews) {
        if (callsUsed >= maxRun) break;

        const newsItemId = newsItem._id.toString();
        const alreadyDrafted = await GeneratedContent.exists({ team_id: tid, news_item_id: newsItemId });
        if (alreadyDrafted) {
          summary.skipped += 1;
          continue;
        }

        const topic = newsItem.title ?? newsItem.category ?? newsItemId;

        const result = await ContentGenerationService.generateContent(
          { team_id: tid, topic, news_item_id: newsItemId },
          makeAdminUser(tid),
        );

        const formats: IGeneratedContentFormats = {
          facebook_post: result.facebook_post,
          facebook_reel_script: result.facebook_reel_script,
          linkedin_post: result.linkedin_post,
          youtube_idea: result.youtube_idea,
          caption: result.caption,
        };
        assertHasAtLeastOneFormat(formats);

        await GeneratedContent.create({
          team_id: tid,
          news_item_id: newsItemId,
          topic: result.topic,
          formats,
          source: 'auto',
          status: 'draft',
          model_used: result.model_used,
        });

        callsUsed += 1;
        teamDrafts += 1;
        summary.drafts_created += 1;
      }

      if (teamDrafts > 0 || topNews.length > 0) {
        summary.teams_processed += 1;
      }
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : err },
        `[auto-gen] team "${team.name}" (${tid}) failed`,
      );
    }

    if (callsUsed >= maxRun) {
      logger.info(`[auto-gen] quota cap reached (${maxRun} calls) — stopping early`);
      break;
    }
  }

  return summary;
};
