export type TopPost = {
  title: string
  reach: number
  engagement: number
  format: string
  published_at: string
}

export type ContentBreakdown = {
  format: string
  avg_engagement_rate: number
}

export type PlatformSummary = {
  platform: "facebook" | "youtube" | "linkedin"
  reach: number
  engagements: number
  views: number
  engagement_rate: number
  delta_reach: number
  delta_engagement: number
  top_posts: TopPost[]
  best_time: string
  sparkline: number[]
  content_breakdown: ContentBreakdown[]
}

export type ContentOpportunity = {
  rank: number
  topic: string
  formats: string[]
  opportunity_score: number
  reason: string
}

export type Report = {
  period: { start: string; end: string }
  overview: {
    total_reach: number
    total_engagements: number
    total_views: number
    avg_engagement_rate: number
    delta_reach: number
    delta_engagements: number
    delta_views: number
    delta_engagement_rate: number
  }
  platforms: PlatformSummary[]
  ai_insight: string
  opportunities: ContentOpportunity[]
  generated_at: string
}

const now = new Date()
const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000)

export const MOCK_REPORT: Report = {
  period: {
    start: thirtyDaysAgo.toISOString(),
    end: now.toISOString(),
  },
  overview: {
    total_reach: 523_400,
    total_engagements: 22_100,
    total_views: 124_000,
    avg_engagement_rate: 4.2,
    delta_reach: 21,
    delta_engagements: 15,
    delta_views: 23,
    delta_engagement_rate: 0.4,
  },
  platforms: [
    {
      platform: "facebook",
      reach: 284_000,
      engagements: 11_928,
      views: 0,
      engagement_rate: 4.2,
      delta_reach: 18,
      delta_engagement: -3,
      top_posts: [
        {
          title: "JavaScript vs Python 2024 — কোনটা আগে শেখা উচিত?",
          reach: 12_400,
          engagement: 1_004,
          format: "Text + Image",
          published_at: new Date(now.getTime() - 8 * 86_400_000).toISOString(),
        },
        {
          title: "Remote job পাওয়ার ৫টা সহজ পথ — Bangladesh থেকে",
          reach: 9_800,
          engagement: 715,
          format: "Carousel",
          published_at: new Date(now.getTime() - 14 * 86_400_000).toISOString(),
        },
        {
          title: "React কেন শেখা উচিত ২০২৪-এ?",
          reach: 8_200,
          engagement: 566,
          format: "Text",
          published_at: new Date(now.getTime() - 20 * 86_400_000).toISOString(),
        },
      ],
      best_time: "7–9 PM weekdays, 10 AM–12 PM weekends",
      sparkline: [8200, 9100, 7800, 11200, 9600, 10800, 12400],
      content_breakdown: [
        { format: "Career guides", avg_engagement_rate: 7.8 },
        { format: "Tech explainers", avg_engagement_rate: 5.9 },
        { format: "Reels", avg_engagement_rate: 5.2 },
        { format: "News reactions", avg_engagement_rate: 3.8 },
        { format: "Polls", avg_engagement_rate: 3.1 },
      ],
    },
    {
      platform: "youtube",
      reach: 98_000,
      engagements: 6_272,
      views: 124_000,
      engagement_rate: 6.4,
      delta_reach: 23,
      delta_engagement: 19,
      top_posts: [
        {
          title: "Next.js 14 Full Course — Bangla Complete Tutorial",
          reach: 18_400,
          engagement: 1_472,
          format: "Tutorial",
          published_at: new Date(now.getTime() - 5 * 86_400_000).toISOString(),
        },
        {
          title: "Job পাওয়ার পর কী করবো? Junior Developer Survival Guide",
          reach: 14_200,
          engagement: 1_136,
          format: "Career Guide",
          published_at: new Date(now.getTime() - 12 * 86_400_000).toISOString(),
        },
        {
          title: "ChatGPT দিয়ে Coding — ৫টা Practical Use Case",
          reach: 11_800,
          engagement: 944,
          format: "AI Review",
          published_at: new Date(now.getTime() - 19 * 86_400_000).toISOString(),
        },
      ],
      best_time: "6–8 PM weekdays",
      sparkline: [3800, 4200, 3600, 5100, 4800, 5600, 6200],
      content_breakdown: [
        { format: "Full tutorials", avg_engagement_rate: 9.2 },
        { format: "Career guides", avg_engagement_rate: 8.1 },
        { format: "AI reviews", avg_engagement_rate: 7.6 },
        { format: "Shorts", avg_engagement_rate: 4.8 },
        { format: "DevOps content", avg_engagement_rate: 2.4 },
      ],
    },
    {
      platform: "linkedin",
      reach: 141_400,
      engagements: 3_900,
      views: 0,
      engagement_rate: 2.8,
      delta_reach: 31,
      delta_engagement: 28,
      top_posts: [
        {
          title: "Why Bangladesh developers are winning remote jobs in 2024",
          reach: 14_200,
          engagement: 568,
          format: "Article",
          published_at: new Date(now.getTime() - 7 * 86_400_000).toISOString(),
        },
        {
          title: "I reviewed 50 junior developer portfolios. Here's what was missing.",
          reach: 11_800,
          engagement: 472,
          format: "Text post",
          published_at: new Date(now.getTime() - 16 * 86_400_000).toISOString(),
        },
        {
          title: "TypeScript vs JavaScript in 2024 — the honest take",
          reach: 9_400,
          engagement: 376,
          format: "Text post",
          published_at: new Date(now.getTime() - 22 * 86_400_000).toISOString(),
        },
      ],
      best_time: "8–10 AM weekdays",
      sparkline: [2800, 3100, 2600, 3800, 3400, 4100, 4600],
      content_breakdown: [
        { format: "Career insights", avg_engagement_rate: 4.8 },
        { format: "Tech opinions", avg_engagement_rate: 3.9 },
        { format: "Industry news", avg_engagement_rate: 2.8 },
        { format: "Company updates", avg_engagement_rate: 1.6 },
      ],
    },
  ],
  ai_insight: `গত ৩০ দিনে Next Level Engineer-এর সব platform মিলিয়ে reach ২১% বেড়েছে — এটা একটা strong signal যে তোমাদের content strategy কাজ করছে।

তিনটা বড় pattern দেখলাম:

প্রথমত, Career-related content সব platform-এ consistently best perform করে। Facebook-এ "remote job" post, YouTube-এ "career guide" video, LinkedIn-এ "portfolio mistakes" article — সবগুলো top 3-এ আছে। এই মাসে career content ৪০% বেশি দাও।

দ্বিতীয়ত, YouTube-এ Next.js এবং React tutorial-এর watch time সবচেয়ে বেশি (avg 8m 42s)। কিন্তু তুমি প্রতি মাসে মাত্র ২টা tutorial করছো। এই gap বাড়াও — এই category-তে তোমাদের audience সবচেয়ে loyal।

তৃতীয়ত, Facebook engagement rate একটু কমেছে (↓3%)। কারণ হলো last few posts-এর hook strong ছিল না। Solution: প্রতিটা post-এর প্রথম দুই লাইন নিয়ে বেশি সময় দাও — এটাই scroll stop করে।

এই সপ্তাহের সবচেয়ে বড় opportunity: React 19 content। তোমাদের historical data বলছে React topics ৩× avg engagement পায়। Trend score ৯.২। এটা এড়িয়ে গেলে আফসোস হবে।`,
  opportunities: [
    {
      rank: 1,
      topic: "React 19 Released — Server Components Stable",
      formats: ["YouTube Tutorial", "Facebook Post", "LinkedIn Article"],
      opportunity_score: 9.1,
      reason:
        "React content gets 3× your avg YouTube engagement. trend_score 9.2 + your historical performance = highest ROI this week.",
    },
    {
      rank: 2,
      topic: "Bangladesh Becomes Top 10 Freelancing Country",
      formats: ["Facebook Post", "YouTube Video", "LinkedIn Post"],
      opportunity_score: 8.9,
      reason:
        "Local news + career angle = your highest-performing combination. Predicted Facebook reach: 15–20K. High share probability.",
    },
    {
      rank: 3,
      topic: "OpenAI o3 — Reasoning Model Benchmarks",
      formats: ["YouTube Video", "Facebook Reel", "LinkedIn Post"],
      opportunity_score: 8.4,
      reason:
        "AI news drives your highest LinkedIn impressions. YouTube AI reviews avg 7.6% engagement — above your channel average.",
    },
    {
      rank: 4,
      topic: "Remote Work Tech Jobs Up 40% in Southeast Asia",
      formats: ["LinkedIn Article", "Facebook Post"],
      opportunity_score: 7.6,
      reason:
        "Career + regional relevance = strong LinkedIn performance. Your student audience will share this broadly on Facebook.",
    },
    {
      rank: 5,
      topic: "Next.js 15 Stable — Partial Prerendering GA",
      formats: ["YouTube Tutorial", "Facebook Post"],
      opportunity_score: 7.9,
      reason:
        "Next.js is your #2 YouTube topic by watch time. PPR is a genuine architectural shift — tutorial format will hold retention.",
    },
  ],
  generated_at: new Date(now.getTime() - 3_600_000).toISOString(),
}
