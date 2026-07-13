export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
}

export const INITIAL_MESSAGE: ChatMessage = {
  id: "init",
  role: "assistant",
  content: `আসসালামু আলাইকুম! আমি Growth Studio-র AI assistant। 👋

আমি তোমাকে help করতে পারবো:
• এই সপ্তাহের trending tech news নিয়ে
• তোমার Facebook, YouTube, LinkedIn performance নিয়ে
• কোন content এখন বানানো উচিত সেই decision নিয়ে

তুমি Banglish বা English যেকোনো ভাষায় জিজ্ঞেস করতে পারো। কী জানতে চাও?`,
  timestamp: new Date().toISOString(),
}

export const MOCK_RESPONSES: { keywords: string[]; response: string }[] = [
  {
    keywords: ["ai", "artificial intelligence", "openai", "chatgpt", "llm", "model"],
    response: `এই সপ্তাহে AI নিয়ে বেশ কিছু important news আছে! 🔥

**Top AI News (Trend Score: 8.7–9.2):**

1. **OpenAI o3** — ARC-AGI benchmark-এ ৮৭.৫% score, যেটা human-level। তোমাদের audience-এর জন্য এটা highly relevant কারণ AI posts তোমাদের LinkedIn-এ সবচেয়ে বেশি impression পায়।

2. **GitHub Copilot Free** — সব GitHub users-এর জন্য free হয়ে গেছে। এই type-এর "free tool" content তোমাদের Facebook community-তে viral হওয়ার chance বেশি।

3. **Meta Llama 3.3 70B** — Consumer hardware-এ চলে, open-source। YouTube tutorial-এর জন্য perfect topic।

**আমার recommendation:** OpenAI o3 নিয়ে আজকেই একটা Facebook post করো। opportunity_score ৮.৪ — মানে তোমাদের audience এটা engage করবে।

Generate করতে চাইলে "Generate content" button click করো যেকোনো card-এ!`,
  },
  {
    keywords: ["facebook", "fb", "post", "engagement", "reach", "ফেসবুক"],
    response: `তোমাদের Facebook page-এর last 30 days performance দেখলাম। এখানে key insights আছে: 📊

**Overview:**
• Total Reach: 2,84,000+ (↑18% from previous month)
• Avg Engagement Rate: 4.2% (industry average 2.1% — তোমরা ভালোই করছো!)
• Best performing format: Career guides + Bangla explainers

**Top 3 Posts (by engagement):**
1. "JavaScript vs Python 2024" — 12.4K reach, 8.1% engagement
2. "Remote job পাওয়ার সহজ পথ" — 9.8K reach, 7.3% engagement
3. "React কেন শেখা উচিত?" — 8.2K reach, 6.9% engagement

**Best time to post:** রাত ৭টা–৯টা (weekdays), সকাল ১০টা–১২টা (weekends)

**এই সপ্তাহের recommendation:** Bangladesh freelancing top 10 news টা post করো — এই type-এর locally-relevant content তোমাদের best performer। Predicted reach: 15K+`,
  },
  {
    keywords: ["youtube", "video", "views", "watch", "ইউটিউব", "channel"],
    response: `YouTube channel analytics দেখলাম — অনেক positive trend! 🎬

**Last 30 Days:**
• Total Views: 1,24,000 (↑23%)
• Avg Watch Time: 8m 42s (excellent for educational content!)
• CTR: 6.8% (goal হলো >5% — তুমি সেটা ছাড়িয়ে গেছো)
• Subscribers gained: +1,847

**Top Performing Topics (by watch time):**
1. Next.js tutorials — 12m avg watch time
2. Career guidance videos — 10m avg watch time
3. AI tool reviews — 9m avg watch time

**Underperforming:** DevOps content (3m avg watch time) — এই category কম করাই ভালো।

**এখন কোন video বানাবে?**
আমার top pick: "React 19 সম্পূর্ণ গাইড" — trend_score 9.2 + তোমাদের React content historically 3× avg engagement পায়। এটা easily 50K+ views পাবে।`,
  },
  {
    keywords: ["react", "nextjs", "next.js", "javascript", "typescript", "web dev", "webdev"],
    response: `Web Dev category-তে এই সপ্তাহে অনেক বড় news! 💻

**Trending (High Opportunity):**

🔥 **React 19 Stable** (trend: 9.2, opportunity: 9.1)
Server Components stable হয়েছে। এটা তোমাদের #1 priority। React content তোমাদের channel-এ 3× avg engagement পায়।

🔥 **Next.js 15** (trend: 8.3, opportunity: 7.9)
Partial Prerendering GA — tutorial-এর জন্য excellent। Next.js তোমাদের #2 YouTube topic by watch time।

**Moderate Interest:**
- Node.js 23 — TypeScript stripping নিয়ে intermediate tutorial ভালো হবে
- TypeScript 5.7 — niche audience, LinkedIn-এর জন্য better
- Bun 1.2 — "Bun vs Node" comparison video viral potential আছে

**Action plan এই সপ্তাহে:**
1. 🎬 YouTube: React 19 full tutorial (highest ROI)
2. 📘 Facebook: Next.js 15 explainer post
3. 💼 LinkedIn: TypeScript 5.7 technical breakdown`,
  },
  {
    keywords: ["career", "job", "freelance", "remote", "salary", "ক্যারিয়ার", "চাকরি"],
    response: `Career content তোমাদের Facebook-এ সবচেয়ে ভালো perform করে — এই সপ্তাহে দুটো excellent opportunity আছে! 🚀

**Top Career News:**

🇧🇩 **Bangladesh Top 10 Freelancing** (opportunity: 8.9!)
এটা তোমাদের সর্বোচ্চ opportunity score এই সপ্তাহে। Local news + career advice = তোমাদের audience-এর জন্য perfect। Expected Facebook reach: 18K+

**Remote Jobs SE Asia +40%** (opportunity: 7.6)
LinkedIn-এর জন্য excellent। Professional audience-এর কাছে highly relevant।

**আমার content plan suggestion:**
- **আজকে (Facebook):** "Bangladesh Top 10 Freelancing Country!" — emotional hook, share-worthy
- **কাল (YouTube):** "Freelancing Roadmap 2025 — Bangladesh থেকে কীভাবে শুরু করবে"
- **পরশু (LinkedIn):** Remote job opportunity analysis — thought leadership angle

Career content থেকে তোমাদের highest-converting leads আসে course purchases-এর জন্য। এই topic গুলো prioritize করো।`,
  },
  {
    keywords: ["report", "analytics", "performance", "linkedin", "strategy", "plan"],
    response: `তোমাদের cross-platform 30-day report এর summary দিচ্ছি! 📈

**Overall Health: Excellent**
- Total Reach: 5,23,000+ (↑21% MoM)
- Total Engagements: 22,100+ (↑15% MoM)
- Best Platform: YouTube (highest growth rate)
- Biggest Opportunity: Facebook (highest absolute reach)

**Platform-specific insights:**

**Facebook** 🔵
Reach বেড়েছে কিন্তু engagement rate একটু down। Solution: আরো engaging hooks দরকার — প্রথম ২ লাইনেই reader-কে catch করতে হবে।

**YouTube** 🔴
Watch time ও subscribers দুটোই strong growth। Next.js আর React tutorials কে double down করো।

**LinkedIn** 🔵
Impression কম কিন্তু quality high — professional audience engage করছে। Technical + career content continue করো।

**AI Recommendation:**
এই সপ্তাহে Bangladesh freelancing news + React 19 দিয়ে এক সপ্তাহের full content calendar তৈরি করা possible। Generate করতে চাইলে জানাও!`,
  },
  {
    keywords: ["security", "vulnerability", "cve", "hack", "breach"],
    response: `Security news এই সপ্তাহে বেশ significant। তবে তোমাদের audience-এর জন্য strategy টা একটু আলাদা।

**Security News:**
🔴 **npm tar package CVE** (trend: 7.8) — Critical vulnerability, millions of projects affected
🟡 **OWASP LLM Top 10 2025** (trend: 6.3) — AI security নিয়ে new guidelines

**তোমাদের audience-এর জন্য recommendation:**

Security content তোমাদের channel-এ moderate performance দেয়। তবে strategic use আছে:

**Facebook:** Skip direct security posts — তোমাদের audience primarily career + web dev focused
**LinkedIn:** ✅ npm CVE টা LinkedIn-এ post করো — developer credibility বাড়ে, authority signal হিসেবে কাজ করে
**YouTube:** OWASP LLM Top 10 নিয়ে একটা video interesting হবে — AI + security = hot combination

**সব মিলিয়ে:** Security content-কে "credibility builder" হিসেবে use করো, primary content হিসেবে না।`,
  },
  {
    keywords: ["generate", "content", "create", "write", "বানাও", "লিখো"],
    response: `অবশ্যই! Content generate করার জন্য "Generate" section-এ যাও।

**Quick guide:**

1. **Feed থেকে directly:** যেকোনো news card-এ "Generate content" button click করো — topic automatically fill হয়ে যাবে

2. **নিজে topic দাও:** Generate page-এ গিয়ে যেকোনো topic লিখো

**তুমি পাবে:**
- ✅ Facebook post (Banglish, engaging hook সহ)
- ✅ Facebook Reel script (60-90 সেকেন্ড)
- ✅ LinkedIn post (professional tone)
- ✅ YouTube video idea (title + hook + full chapter outline)
- ✅ Short caption (Instagram/Twitter-এর জন্য)

**আমার recommendation এখন:**
React 19 বা Bangladesh Freelancing news — এই দুটোর opportunity score সবচেয়ে বেশি এই সপ্তাহে। এগুলো দিয়ে শুরু করো!`,
  },
]

export function findResponse(input: string): string {
  const lower = input.toLowerCase()
  const match = MOCK_RESPONSES.find((r) => r.keywords.some((k) => lower.includes(k)))
  return (
    match?.response ??
    `ভালো প্রশ্ন! আমি এই বিষয়ে আরো details দিয়ে help করতে পারতাম যদি real backend connected থাকতো।

তবে এখন আমি বলতে পারি — তোমাদের এই সপ্তাহের top opportunities হলো:
1. 🔥 React 19 content (trend: 9.2)
2. 🇧🇩 Bangladesh Freelancing news (opportunity: 8.9)
3. 🤖 OpenAI o3 explainer (trend: 8.7)

এগুলো নিয়ে আরো জানতে চাইলে জিজ্ঞেস করো, অথবা Generate section-এ গিয়ে directly content বানাও!`
  )
}
