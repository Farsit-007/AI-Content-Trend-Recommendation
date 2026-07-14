import { LLM_MODELS, chatCompletion } from '../../lib/llmClient';

interface ReportContext {
  overview: {
    reach: number;
    engagements: number;
    views: number;
    engagement_rate: number;
    delta: { reach: number; engagements: number; views: number; engagement_rate: number };
  };
  platforms: { platform: string; status: string; overview: { reach: number; engagements: number } | null }[];
  topOpportunity: { title: string; suggested_platform: string } | null;
}

export const generateBanglishInsight = async (ctx: ReportContext): Promise<string | null> => {
  const platformSummary = ctx.platforms
    .filter((p) => p.status === 'ok' && p.overview)
    .map((p) => `${p.platform}: reach ${p.overview!.reach}, engagements ${p.overview!.engagements}`)
    .join('; ');

  const messages = [
    {
      role: 'system' as const,
      content:
        'You are a Bangladeshi social media strategist. Write in Banglish (Bengali + English mixed, as used on Facebook/YouTube). Be specific, data-driven, and actionable. Maximum 3 sentences.',
    },
    {
      role: 'user' as const,
      content: `আমাদের last 30 দিনের data:
- Total reach: ${ctx.overview.reach.toLocaleString()} (${ctx.overview.delta.reach > 0 ? '+' : ''}${ctx.overview.delta.reach}% vs আগের মাস)
- Total engagements: ${ctx.overview.engagements.toLocaleString()} (${ctx.overview.delta.engagements > 0 ? '+' : ''}${ctx.overview.delta.engagements}%)
- Engagement rate: ${ctx.overview.engagement_rate}%
${platformSummary ? `- Platforms: ${platformSummary}` : ''}
${ctx.topOpportunity ? `- Top opportunity: "${ctx.topOpportunity.title}" (${ctx.topOpportunity.suggested_platform})` : ''}

এই data দেখে 2-3 sentence এ বলো আমাদের performance কেমন ছিল এবং next month এ কী focus করা উচিত।`,
    },
  ];

  try {
    return await chatCompletion({ model: LLM_MODELS.standard, messages, temperature: 0.6 });
  } catch (err) {
    console.error('[Report] LLM insight generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
};
