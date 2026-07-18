import { logger } from '../../lib/logger';
import config from '../../config';
import { LLM_MODELS } from '../../lib/llmClient';
import { IRequestUser } from '../User/user.interface';
import { BrandVoiceExample } from '../BrandVoiceExample/brandVoiceExample.model';
import { ContentGenerationService } from '../ContentGeneration/contentGeneration.service';
import { NewsItem } from '../NewsItem/newsItem.model';
import { Team } from '../Team/team.model';
import { IAutoGenerationSummary, IGeneratedContentFormats } from './generatedContent.interface';
import { assertHasAtLeastOneFormat } from './generatedContent.utils';
import { GeneratedContent } from './generatedContent.model';

const TOP_NEWS_PER_TEAM = 3;

const makeAdminUser = (teamId: string): IRequestUser => ({
  id: 'system',
  email: 'system@growth-studio.internal',
  role: 'admin',
  team_ids: [teamId],
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
      const hasExamples = await BrandVoiceExample.exists({ team_id: tid });
      if (!hasExamples) {
        logger.info(`[auto-gen] team "${team.name}" (${tid}): skipped — no brand voice examples`);
        summary.skipped += 1;
        continue;
      }

      const topNews = await NewsItem.find({
        ...(team.subscribed_categories.length ? { category: { $in: team.subscribed_categories } } : {}),
        created_at: { $gte: new Date(Date.now() - maxAgeHours * 3600 * 1000) },
        lifecycle: 'active',
      })
        .sort({ opportunity_score: -1, trend_score: -1 })
        .limit(TOP_NEWS_PER_TEAM)
        .select('_id title category impact_note')
        .lean();

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
          model_used: LLM_MODELS.content,
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
