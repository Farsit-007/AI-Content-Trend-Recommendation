export type YoutubeIdea = {
  title: string
  hook: string
  chapters: string[]
  thumbnail_concept: string
}

export type GeneratedContent = {
  topic: string
  facebook_post: string
  facebook_reel_script: string
  linkedin_post: string
  youtube_idea: YoutubeIdea
  caption: string
}

export const MOCK_CONTENT: GeneratedContent[] = [
  {
    topic: "React 19 Released — Server Components Are Now Stable",
    facebook_post: `🚀 React 19 এসে গেল — এবার Server Components Stable!

ভাই/আপু, আজকে একটা বড় খবর আছে। React 19 officially release হয়ে গেছে এবং এবার Server Components সত্যিকার অর্থেই stable হয়েছে।

এর মানে কী তোমাদের জন্য?
✅ Client-side JavaScript কমবে — page load দ্রুত হবে
✅ Data fetching আর আগের মতো জটিল থাকবে না
✅ use() hook দিয়ে Promises handle করা অনেক সহজ হয়ে গেছে

আমাদের Next Level Engineer community তে আমরা এই নিয়ে একটা full tutorial বানাচ্ছি। তোমরা কি এই topic টা নিয়ে interested? Comment এ জানাও! 👇

#React19 #WebDevelopment #JavaScript #NextLevelEngineer`,

    facebook_reel_script: `[0:00-0:03] HOOK
"React 19 আসছে — এবার সব কিছু বদলে যাবে!"

[0:03-0:15] PROBLEM
তুমি কি জানো এতদিন React-এ data fetch করতে গিয়ে কত complicated code লিখতে হতো? useEffect, loading state, error state — সব আলাদা আলাদা!

[0:15-0:35] SOLUTION
React 19-এ তিনটা বড় জিনিস এসেছে:
1. Server Components stable — server-এ render করো, client-এ শুধু UI
2. Actions — form submit আর async operations অনেক সহজ
3. use() hook — এখন directly Promise থেকে data নাও

[0:35-0:55] DEMO
দেখো কত সহজ হয়ে গেছে: [code দেখাও]

[0:55-1:00] CTA
Full tutorial পেতে চাইলে follow করো। আর comment করো — React 19 নিয়ে কোন topic সবার আগে দেখতে চাও?`,

    linkedin_post: `React 19 is officially stable — and it changes how we build web apps fundamentally.

As someone who has been building with React since v16, the shift to Server Components represents the biggest architectural change in the ecosystem in years.

Three things that matter most for production teams:

1. **Server Components are now stable** — move data fetching to the server, ship less JavaScript, get faster TTI without sacrificing interactivity

2. **Actions simplify async mutations** — no more manual optimistic update boilerplate; React handles pending/error states automatically

3. **The use() hook** — read the value of a Promise or context directly inside render; cleaner than useState + useEffect chains

For teams in Bangladesh building SaaS products: the performance gains from Server Components matter most on mobile connections. Your users on 4G will notice the difference.

Are you planning to migrate to React 19 in your next project? I'd love to hear your team's approach. 👇

#React #WebDevelopment #JavaScript #SoftwareEngineering`,

    youtube_idea: {
      title: "React 19 দিয়ে কি সব বদলে যাবে? — Server Components থেকে Actions পর্যন্ত Full Guide (Bangla)",
      hook: `"তুমি কি জানো, React 19-এর আগে একটা simple data fetch করতে minimum ৩টা useState আর ১টা useEffect লাগতো? React 19-এ এই কাজটা এখন মাত্র ২ লাইনে হয়। আজকে আমি তোমাকে step by step দেখাবো কীভাবে।"`,
      chapters: [
        "00:00 — Intro: React 19 কেন এত বড় ব্যাপার?",
        "02:30 — Server Components কী এবং কীভাবে কাজ করে",
        "08:00 — Client vs Server Component: কোনটা কখন use করবে",
        "14:00 — Actions API: form submission এখন অনেক সহজ",
        "20:00 — use() Hook: Promise থেকে সরাসরি data নাও",
        "26:00 — Live Project: React 19 দিয়ে একটা dashboard বানাই",
        "38:00 — Migration Guide: React 18 থেকে 19-এ কীভাবে যাবে",
        "44:00 — Common Mistakes এবং কীভাবে এড়াবে",
        "48:00 — Outro: Next এ কী আসছে?",
      ],
      thumbnail_concept:
        "Dark background, React logo (blue) on left glowing, large text 'React 19' in white + 'সব বদলে গেল!' in yellow. Your face on right with surprised expression. Red banner at bottom: 'Server Components STABLE'",
    },

    caption: `React 19 এর Server Components এখন stable 🚀 Data fetching আর কখনো আগের মতো জটিল থাকবে না। Full breakdown আসছে — follow করো! #React19 #WebDev`,
  },

  {
    topic: "OpenAI Releases o3 — Reasoning Model Sets New Benchmarks",
    facebook_post: `🤯 OpenAI-এর নতুন AI model o3 — এটা আর আগের মতো না!

আমরা সবাই জানি ChatGPT কত powerful। কিন্তু নতুন o3 model দেখে সত্যিই অবাক হয়ে গেলাম।

ARC-AGI benchmark-এ ৮৭.৫% score — এই test টা এমন ছিল যেটা AI কখনো ভালো করতে পারেনি। Human-level problem solving মানে কী সেটা এখন নতুনভাবে define হচ্ছে।

কিন্তু আমাদের জন্য practically এর মানে কী?
👉 Complex coding problems এখন AI দিয়ে solve করা আরো সহজ হবে
👉 Math আর logic-heavy tasks এ AI আরো reliable হবে
👉 তোমার development workflow আরো fast হবে

তোমরা কি AI tools use করো daily work এ? নিচে comment করো! 👇

#OpenAI #ArtificialIntelligence #o3 #TechNews`,

    facebook_reel_script: `[0:00-0:03] HOOK
"OpenAI-এর নতুন AI এমন একটা test pass করেছে যেটা ৪ বছরেও কোনো AI পারেনি!"

[0:03-0:20] CONTEXT
ARC-AGI — এই benchmark টা specifically design করা হয়েছিল AI-কে fail করাতে। Pure reasoning, no memorization। আজ পর্যন্ত সেরা AI ৩৫% পেয়েছে। o3 পেয়েছে ৮৭.৫%!

[0:20-0:45] WHAT IT MEANS
এর মানে হলো:
1. AI এখন truly নতুন সমস্যা solve করতে পারছে, শুধু pattern follow না করে
2. Coding-এ bug fix থেকে architecture design পর্যন্ত AI help আরো reliable হবে
3. তোমার developer career-এ AI কে tool হিসেবে use করার importance আরো বাড়বে

[0:45-0:57] TAKEAWAY
তুমি কি AI tools শিখতে চাও? Comment করো "AI" — আমরা একটা full series বানাবো।

[0:57-1:00] CTA
Like আর follow করো আরো AI updates পেতে!`,

    linkedin_post: `OpenAI's o3 scored 87.5% on ARC-AGI — a benchmark specifically designed to be resistant to AI pattern-matching.

This matters beyond the benchmark number.

ARC-AGI tests abstract reasoning: given novel visual puzzles, infer the underlying rule and apply it. Previous frontier models plateaued at ~35%. Human average is ~85%. o3 crossed that line.

What this means for developers and product teams:

**Short term**: o3-class reasoning makes AI coding assistants dramatically more useful for architecture decisions, not just autocompletion. The "AI can't understand context" objection weakens significantly.

**Medium term**: Tasks that required human judgment — debugging subtle race conditions, reasoning about distributed system behavior — become tractable for AI assistance.

**For Bangladesh's tech community**: The tooling advantage available to developers in 2025 is unprecedented. Teams that build proficiency with these reasoning models now will have a compounding advantage.

The question isn't whether to use AI in your workflow. It's how fast you can build the judgment to use it well.

#AI #MachineLearning #OpenAI #SoftwareEngineering #TechLeadership`,

    youtube_idea: {
      title: "OpenAI o3 কি সত্যিই Human-level Intelligence? — ARC-AGI Explained in Bangla",
      hook: `"একটা AI test আছে যেটা specifically design করা হয়েছিল AI-কে fail করাতে। ৪ বছর ধরে কোনো AI ৪০%-এর বেশি পায়নি। OpenAI-এর নতুন o3 model পেয়েছে ৮৭.৫%। আজকে আমরা বুঝবো — এটা কি সত্যিই AGI-র দিকে এক ধাপ? নাকি আবার hype?"`,
      chapters: [
        "00:00 — Intro: o3 কী এবং কেন এত আলোচনা?",
        "03:00 — ARC-AGI Benchmark বোঝা: এটা আসলে কী test করে?",
        "08:00 — o3 কীভাবে ৮৭.৫% পেলো — Technical explanation",
        "14:00 — GPT-4o vs o3: practically কতটা different?",
        "20:00 — Developer-এর জন্য o3 কীভাবে use করবো?",
        "28:00 — AGI কি আসলেই কাছে? Honest analysis",
        "34:00 — তোমার career-এ এর impact কী হবে?",
        "38:00 — Outro",
      ],
      thumbnail_concept:
        "Split screen: left side shows '87.5%' in huge glowing green text, right side shows 'Human: 85%' in white. OpenAI logo top center. Your face bottom right with thinking expression. Dark purple gradient background.",
    },

    caption: `OpenAI o3 — ৮৭.৫% ARC-AGI score 🤯 এই benchmark AI কখনো এতটা ভালো করেনি। Developer হিসেবে তোমার জন্য এর মানে কী? #OpenAI #AI #Tech`,
  },

  {
    topic: "Bangladesh Becomes Top 10 Freelancing Country Globally",
    facebook_post: `🇧🇩 গর্বিত হওয়ার খবর! Bangladesh এখন বিশ্বের Top 10 Freelancing দেশ!

Upwork-এর 2024 Global Talent Report অনুযায়ী Bangladesh এখন ৮ নম্বরে — গত বছর ছিলাম ১৪ নম্বরে।

এর মানে কী?
✅ বিশ্বের companies এখন সরাসরি Bangladesh থেকে talent hire করছে
✅ তোমার skills এর global demand আগের চেয়ে অনেক বেশি
✅ Remote work করে dollar earn করার সুযোগ এখন সত্যিকারের

আমাদের Next Level Engineer community-র হাজার হাজার ভাই/আপু এই journey-তে আছে। তুমি কি freelancing শুরু করতে চাও? অথবা ইতিমধ্যে করছো?

Comment এ তোমার অভিজ্ঞতা share করো! 🙌

#Bangladesh #Freelancing #RemoteWork #NextLevelEngineer #ProudBangladeshi`,

    facebook_reel_script: `[0:00-0:03] HOOK
"Bangladesh এখন world-এর ৮ নম্বর freelancing country — এটা তোমার জন্য কী মানে?"

[0:03-0:20] THE NEWS
Upwork-এর latest report বলছে Bangladesh ৬ ধাপ উপরে উঠেছে এক বছরে। Web development, software engineering, আর digital marketing — এই তিনটা category-তে আমরা সবচেয়ে বেশি এগিয়েছি।

[0:20-0:45] OPPORTUNITY
এটা তোমার জন্য opportunity কারণ:
1. আন্তর্জাতিক clients এখন Bangladesh-এর developers trust করছে বেশি
2. Entry-level freelancer হিসেবেও তুমি $500-1000/month earn করতে পারবে
3. Experience বাড়লে $3000-5000/month অনেকেই করছে

[0:45-0:57] CALL TO ACTION
তুমি কি freelancing শিখতে চাও? Comment এ "FREELANCE" লিখো — আমরা একটা complete roadmap বানাবো।

[0:57-1:00] CTA
Follow করো, আর এই video টা share করো তোমার বন্ধুদের সাথে!`,

    linkedin_post: `Bangladesh is now ranked #8 globally for freelance tech talent — up from #14 just one year ago.

This isn't just a feel-good statistic. It reflects a structural shift in how global companies source technical talent.

Three things this signals for the tech community here:

**1. Trust is earned, not given.** This ranking comes from actual project delivery. Bangladeshi developers have demonstrated quality, communication, and reliability at scale. That reputation compounds.

**2. The next step is positioning.** Being in the top 10 means more competition arrives — other global talent sees the same opportunities. The developers who will win in 2025 are those who specialize (not generalize) and build visible proof of work.

**3. The dollar-taka opportunity window is real.** With remote work normalized globally, a developer earning $2,000/month in USD is in the top percentile of local purchasing power. This window won't stay open forever as local salaries catch up.

For those early in their tech careers: the foundation you build today — English communication, portfolio projects, open-source contributions — will determine which side of this opportunity you're on in 3 years.

What's your freelancing journey been like? I'd love to hear from the community. 👇

#Bangladesh #FreelanceTech #RemoteWork #CareerGrowth #TechCommunity`,

    youtube_idea: {
      title: "Bangladesh Top 10 Freelancing Country! — তুমি কীভাবে এই সুযোগ নেবে? (Full Roadmap)",
      hook: `"তুমি কি জানো এই মুহূর্তে বিশ্বের হাজার হাজার company বাংলাদেশের developer খুঁজছে? Upwork রিপোর্ট বলছে আমরা এখন top 8! আজকে আমি তোমাকে দেখাবো কীভাবে এই সুযোগটা তুমি actually নিতে পারবে।"`,
      chapters: [
        "00:00 — Intro: Bangladesh Freelancing-এ top 8 — কেন এটা বড় ব্যাপার",
        "04:00 — কোন skills এর demand সবচেয়ে বেশি এখন?",
        "10:00 — Freelancing শুরু করার Step-by-Step Roadmap",
        "18:00 — Upwork Profile কীভাবে optimize করবে",
        "26:00 — প্রথম client কীভাবে পাবে? Proven strategies",
        "34:00 — Rate কত charge করবে? Pricing guide",
        "40:00 — Real Stories: আমাদের community থেকে success stories",
        "46:00 — Common Mistakes এবং কীভাবে এড়াবে",
        "50:00 — Outro: তোমার next step",
      ],
      thumbnail_concept:
        "Bangladesh flag colors (green/red) background with map silhouette. Large '#8' in gold. Text: 'বিশ্বের Top Freelancing দেশ!' Your face on right smiling proudly. Dollar sign icons floating around.",
    },

    caption: `🇧🇩 Bangladesh এখন বিশ্বের ৮ নম্বর freelancing country! তোমার skills এর global demand এখন সত্যিকারের। এই সুযোগ নাও! #Bangladesh #Freelancing #RemoteWork`,
  },

  {
    topic: "Next.js 15 Stable — Partial Prerendering Goes GA",
    facebook_post: `⚡ Next.js 15 Stable — এবার Partial Prerendering সবার জন্য!

Next.js 15 officially stable হয়ে গেছে এবং এর সবচেয়ে বড় feature — Partial Prerendering (PPR) — এখন production-ready!

PPR মানে কী সহজ ভাষায়?
তোমার page-এর static parts আগে load হবে (super fast), dynamic parts পরে আসবে। User প্রথমেই content দেখতে পাবে — waiting করতে হবে না।

আর কী আসছে?
✅ React 19 full support
✅ after() API — response send করার পরে code run করো
✅ Turbopack stable

আমরা Next.js নিয়ে একটা full series করছি। তুমি কি interested? Comment এ "NEXT" লিখো! 👇

#NextJS #WebDevelopment #React #JavaScript`,

    facebook_reel_script: `[0:00-0:03] HOOK
"Next.js 15 এসে গেছে — আর এবার page load হবে rocket-এর speed এ!"

[0:03-0:20] THE FEATURE
Partial Prerendering কী? সহজ করে বলি।
তোমার website-এর header, footer, navigation — এগুলো সব users-এর জন্য same। এগুলো instantly দেখাও।
তোমার user-specific content — cart, feed, dashboard — এগুলো পরে load হোক।
এই দুটো একসাথে করার নামই PPR।

[0:20-0:45] WHY IT MATTERS
এর আগে তোমাকে choose করতে হতো — static নাকি dynamic?
Next.js 15-এ দুটোই পাবে একসাথে।
Result? আরো fast website + আরো dynamic features। Users happy, Google happy, তুমি happy।

[0:45-0:57] DEMO TEASE
Full tutorial আসছে। Comment করো "PPR" আর notification পাও!

[0:57-1:00] CTA
Like + Follow করো!`,

    linkedin_post: `Next.js 15 is stable, and Partial Prerendering (PPR) is now generally available.

After years of the static-vs-dynamic dichotomy in web architecture, PPR dissolves the trade-off.

The core idea: within a single route, you can interleave static shells (rendered at build time, served instantly from CDN) with dynamic holes (streamed from the server). Users see a meaningful page immediately; personalized content fills in without blocking the initial paint.

Why this matters for teams building in 2025:

**Performance**: Static shell + streaming dynamic content hits better Core Web Vitals than either pure SSR or client-fetching. No more choosing between fast TTFB and fresh data.

**Developer experience**: The mental model is simpler than managing hydration boundaries manually. Suspense boundaries become the API — wrap the dynamic part, PPR handles the rest.

**React 19 co-evolution**: PPR and React 19's Server Components were designed together. Teams adopting both get a coherent data-fetching story that removes the majority of client-side state management complexity.

For teams building Next.js apps in Bangladesh: this is the stack update worth prioritizing in your next project kickoff.

#NextJS #React #WebDevelopment #JavaScript #FullStack`,

    youtube_idea: {
      title: "Next.js 15 — Partial Prerendering কী এবং কেন এটা Game Changer? (Bangla Tutorial)",
      hook: `"তোমার website কি slow? Next.js 15-এর নতুন feature দিয়ে আমি এখন দেখাবো কীভাবে page load time ৭০% কমানো যায় — কোনো compromise ছাড়াই।"`,
      chapters: [
        "00:00 — Intro: Next.js 15 কী নিয়ে এলো?",
        "03:00 — Partial Prerendering (PPR) কী? Simple explanation",
        "09:00 — Static vs Dynamic: পুরনো সমস্যাটা কী ছিল?",
        "15:00 — PPR কীভাবে সেই সমস্যা solve করে",
        "21:00 — Live Demo: PPR implement করা step by step",
        "30:00 — React 19 + Next.js 15: Perfect combination",
        "36:00 — after() API: কী কাজে লাগবে?",
        "40:00 — Turbopack: dev experience কতটা fast হলো?",
        "45:00 — Migration: Next.js 14 থেকে 15-এ যাবে কীভাবে?",
        "50:00 — Outro",
      ],
      thumbnail_concept:
        "Speed meter graphic showing max speed, text 'Next.js 15' in large white font, 'Partial Prerendering' in violet below. Lightning bolt icon. Your face bottom left. Dark background with subtle grid.",
    },

    caption: `Next.js 15 stable 🚀 Partial Prerendering এখন সবার জন্য! Static speed + Dynamic content — দুটো একসাথে। Tutorial আসছে! #NextJS #WebDev #JavaScript`,
  },
]

export function findMockContent(topic: string): GeneratedContent {
  const lower = topic.toLowerCase()
  const match = MOCK_CONTENT.find((c) =>
    c.topic.toLowerCase().split(" ").some((word) => word.length > 4 && lower.includes(word))
  )
  return match ?? MOCK_CONTENT[0]
}
