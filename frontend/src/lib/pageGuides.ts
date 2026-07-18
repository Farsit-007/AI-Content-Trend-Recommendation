export interface PageGuide {
  title: string;
  what: string;
  why: string;
  how: string;
  tips?: string[];
}

/**
 * One entry per dashboard page — the content behind the "?" help button
 * (`components/dashboard/PageHelp.tsx`). Keyed by a short, stable id rather than the route,
 * so it survives route renames.
 */
export const PAGE_GUIDES: Record<string, PageGuide> = {
  overview: {
    title: 'Overview',
    what: 'Your dashboard home — a snapshot of your team\'s activity, and (for admins) the whole platform.',
    why: 'Before you dig into any one tool, this answers "what needs my attention right now" in a glance — drafts waiting for review, hot stories, and whether your team\'s voice is set up yet.',
    how: 'Every number links somewhere: click a stat card to jump straight to the page behind it. The "cold start" banner (if you see one) means your team has no brand-voice examples yet — generation is running in a generic voice until you add some.',
    tips: [
      'Admins and super admins also see a "Platform" section with system-wide numbers.',
      'This page refreshes automatically whenever you switch teams.',
    ],
  },
  feed: {
    title: 'Feed',
    what: 'The live, ranked trend feed — tech news pulled from nine sources and scored for relevance and "opportunity."',
    why: 'This is the product\'s starting point: "what\'s worth writing about today," so you\'re reacting to real trends instead of staring at a blank page.',
    how: 'Filter by category tab, search, or re-sort (Opportunity / Trending / Newest). Click any card to open its full detail, read why it matters, and jump straight into Generate. If a category or score looks wrong for your team, use "Correct" in the drawer — it only changes what your team sees.',
    tips: [
      'The emerald highlight on a card means it cleared the high-opportunity threshold (≥ 7.5).',
      'No explicit category filter? The feed auto-applies your team\'s subscribed categories.',
    ],
  },
  generate: {
    title: 'Generate',
    what: 'Turns a trend (or any topic you type) into ready-to-post drafts — Facebook, LinkedIn, a Reel script, a caption, or a YouTube idea.',
    why: 'This is the headline feature: AI-written first drafts, but grounded in your team\'s real voice and the actual facts of the story, not generic AI filler.',
    how: 'Pick a language, an optional style pack, and which formats you want, then hit Generate. Each result is fully editable — regenerate a single format, ask for a quick tweak ("shorter", "more casual"), or save the whole set as a draft.',
    tips: [
      'Regenerating one format never touches the others.',
      'One level of undo is kept after every regenerate or refine.',
    ],
  },
  drafts: {
    title: 'Drafts',
    what: 'Every draft ever generated for your team — hand-written or produced by the overnight auto-generation job — in one review queue.',
    why: 'Generated text only lives in memory until it\'s saved here; this is the single place to actually decide what\'s worth posting.',
    how: 'Filter by status or source, then Approve or Dismiss each row. Approving/dismissing is a one-way move forward — it can\'t be reverted to "draft."',
    tips: ['Filter to source = Auto to see specifically what ran overnight while you were away.'],
  },
  chat: {
    title: 'Chat',
    what: 'A conversational assistant scoped to your team\'s actual news feed.',
    why: 'Sometimes a question is faster than scrolling — "what\'s trending in AI right now," "summarize the top DevOps story" — and answers here are grounded in real stored items, not invented.',
    how: 'Type a question or tap a suggested prompt. Switch languages any time with the toggle at the top.',
  },
  team: {
    title: 'Team Settings',
    what: 'Everything that makes generated content sound like your team: language default, custom instructions, category subscriptions, a default style pack, custom categories, and brand-voice examples.',
    why: 'The model is never fine-tuned — this page (plus your brand-voice examples) is the entire mechanism for personalization.',
    how: 'Admins can edit every section; members see the same page read-only. The most important section is Brand voice examples — add 25–30 real posts your team has written for the best results.',
    tips: ['Custom categories are for correcting a story\'s category on the Feed — they\'re a separate pool from your subscribed categories.'],
  },
  guide: {
    title: 'Guide',
    what: 'A role-aware walkthrough of the whole platform.',
    why: 'One page that explains the full loop and what your specific role can do, so nothing in the product is a mystery.',
    how: 'Read top to bottom, or jump straight to a card\'s linked page.',
  },
  account: {
    title: 'Account',
    what: 'Your own account details and self-service password rotation.',
    why: 'Growth Studio has no self-registration — every account is admin-created — so this is the one thing you can always change yourself.',
    how: 'Enter your current password and a new one. You\'ll stay signed in on this device, but every other session gets signed out — that\'s intentional.',
  },
  pipeline: {
    title: 'Pipeline',
    what: 'Monitoring (and manual control) for the two background jobs that power the whole product: news ingestion and auto-generation.',
    why: 'The feed\'s value depends entirely on ingestion actually running and finding fresh content — this is where you\'d notice a source silently breaking before anyone else does.',
    how: 'Both jobs already run on a schedule; the buttons here force a run right now. Source health flags a source once it\'s returned zero items for 3 runs in a row.',
    tips: ['Running ingestion is a heavy, real-cost operation — one embedding + LLM call per surviving item. Use it deliberately, not repeatedly.'],
  },
  users: {
    title: 'Users',
    what: 'Account creation and the full directory of every user in the system.',
    why: 'There\'s no self-registration in Growth Studio by design — every account is provisioned deliberately, here.',
    how: 'Fill the form to create an account with a role and optional starting teams. Only a super admin can create another super admin.',
  },
  teams: {
    title: 'Teams',
    what: 'Stand up new teams and manage any team\'s roster — even ones you\'re not personally a member of.',
    why: 'An admin oversees teams organization-wide; membership in a team isn\'t required to configure or staff it.',
    how: 'Create a team with optional starting members, then expand any team to add or remove people.',
    tips: ['Deleting a team removes its roster, but does not delete its drafts or brand-voice examples — those are orphaned by design (a known trade-off, not a bug).'],
  },
  catalog: {
    title: 'Catalog',
    what: 'The shared, global news record every team sees — distinct from a per-team correction on the Feed.',
    why: 'Sometimes the automated pipeline misses a story, or gets one wrong for everyone, not just your team — this is where an admin fixes it once, globally.',
    how: 'Backfill a story with the form, or expand any existing item to edit its title, score, category, or delete it outright.',
  },
  stylePacks: {
    title: 'Style Packs',
    what: 'The platform-wide library of curated writing styles any team can opt into as their default.',
    why: 'On top of a team\'s own brand-voice examples, a style pack layers in a specific, reusable voice (e.g. "energetic Bangla tech explainer") that any team can adopt.',
    how: 'Create a pack, teach it example posts, and retire (rather than delete) one that\'s still referenced by a team — retiring hides it from new selections without breaking existing ones.',
    tips: ['Deleting a pack cascades its examples but doesn\'t touch any team still pointing at it — that team\'s next generation just quietly proceeds without a style pack.'],
  },
};
