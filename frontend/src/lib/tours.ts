import type { TourStep } from '@/context/tour-context';
import type { TSidebarItem } from '@/types';

/** One line per sidebar entry — used to build the "whole system" tour dynamically from
 *  whatever the current role's sidebar actually shows (see `buildSidebarTour`). */
const NAV_DESCRIPTIONS: Record<string, string> = {
  Overview: 'Your home base — a snapshot of your team\'s activity and, if you\'re an admin, the whole platform.',
  Feed: 'The live, ranked trend feed. This is where every workday starts: see what\'s trending before you write anything.',
  Generate: 'Turn any trend (or your own topic) into ready-to-post drafts, written in your team\'s voice.',
  Drafts: 'Every draft ever generated for your team lands here — review, approve, or dismiss.',
  Chat: 'Ask questions and get answers grounded in your team\'s real news feed — no invented facts.',
  Team: 'Your team\'s voice, categories, style pack, and brand-voice examples — the settings behind every generation.',
  Guide: 'A full role-aware walkthrough of the platform, any time you want to revisit it.',
  Account: 'Your account details and self-service password rotation.',
  Pipeline: 'Monitor and manually trigger the news-ingestion and auto-generation background jobs.',
  Users: 'Create accounts and browse every user in the system — there\'s no self-registration here.',
  Teams: 'Stand up new teams and manage any team\'s roster, even ones you don\'t belong to.',
  Catalog: 'The shared global news catalog — fix or backfill a story for every team at once.',
  'Style Packs': 'The platform-wide library of curated writing styles any team can opt into.',
};

const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Builds the "whole system" tour from the current role's actual sidebar items, so a member,
 *  an admin, and a super admin each get a tour that matches what they can really see. */
export function buildSidebarTour(items: TSidebarItem[]): TourStep[] {
  return items
    .filter((item) => NAV_DESCRIPTIONS[item.label])
    .map((item) => ({
      target: `[data-tour="nav-${slug(item.label)}"]`,
      title: item.label,
      content: NAV_DESCRIPTIONS[item.label],
    }));
}

/** Per-page contextual tours — the "Take a tour" button on each page's help popover.
 *  Keyed the same as `lib/pageGuides.ts`. */
export const PAGE_TOURS: Record<string, TourStep[]> = {
  overview: [
    {
      target: '[data-tour="overview-team-stats"]',
      title: 'Your team, at a glance',
      content: 'Drafts waiting for review, this week\'s high-opportunity stories, brand-voice coverage, and headcount — click any card to jump straight to it.',
    },
    {
      target: '[data-tour="overview-recent-drafts"]',
      title: 'Recent drafts',
      content: 'The last few things generated for your team, newest first, with their current status.',
    },
    {
      target: '[data-tour="overview-quick-actions"]',
      title: 'Jump back in',
      content: 'The three things you\'ll do most often, one click away.',
    },
  ],
  feed: [
    {
      target: '[data-tour="feed-controls"]',
      title: 'Filter, search, sort',
      content: 'Tap a category tab to narrow the feed, search by keyword, or re-sort by Opportunity, Trending, or Newest.',
    },
    {
      target: '[data-tour="feed-card"]',
      title: 'A trend card',
      content: 'Source, freshness, category, and two scores at a glance. An emerald border means it cleared the high-opportunity bar. Click any card to see the full story.',
    },
  ],
  generate: [
    {
      target: '[data-tour="generate-controls"]',
      title: 'Set the topic and voice',
      content: 'Type a topic (or arrive here from a Feed story), pick a language and optional style pack, and choose which formats you want.',
    },
    {
      target: '[data-tour="generate-formats"]',
      title: 'Choose your formats',
      content: 'Facebook, LinkedIn, a Reel script, a caption, or a YouTube idea — toggle any combination, then hit Generate.',
    },
  ],
  drafts: [
    {
      target: '[data-tour="drafts-filters"]',
      title: 'Filter the queue',
      content: 'Narrow by status (draft / approved / dismissed) or by source (manual vs the overnight auto-generation job).',
    },
    {
      target: '[data-tour="drafts-list"]',
      title: 'Review each draft',
      content: 'Expand a row to read every generated format, copy it, or Approve / Dismiss it. This is a one-way move forward.',
    },
  ],
  chat: [
    {
      target: '[data-tour="chat-input"]',
      title: 'Ask anything',
      content: 'Every answer is pulled from your team\'s real, stored news feed — not general knowledge, so it stays accurate to what\'s actually trending for you.',
    },
  ],
  team: [
    {
      target: '[data-tour="team-voice"]',
      title: 'Voice profile',
      content: 'Your team\'s default language and any standing instructions the model should always follow.',
    },
    {
      target: '[data-tour="team-brand-voice"]',
      title: 'Brand voice examples',
      content: 'The single biggest lever on generation quality. Add 25-30 real posts your team has written — with zero examples, generation falls back to a generic voice.',
    },
  ],
  pipeline: [
    {
      target: '[data-tour="pipeline-run"]',
      title: 'Run jobs on demand',
      content: 'Both jobs already run on a schedule — use these to force a fresh run right now, e.g. right before a demo.',
    },
    {
      target: '[data-tour="pipeline-health"]',
      title: 'Source health',
      content: 'A source flagged here has returned zero items for 3 runs in a row — worth checking its credentials or URL.',
    },
  ],
  users: [
    {
      target: '[data-tour="users-create"]',
      title: 'Create an account',
      content: 'There\'s no self-registration — every account, with a role and optional starting teams, is created right here.',
    },
  ],
  teams: [
    {
      target: '[data-tour="teams-create"]',
      title: 'Stand up a team',
      content: 'Name it, describe it, optionally staff it immediately — then manage its roster any time from the list below.',
    },
  ],
  catalog: [
    {
      target: '[data-tour="catalog-create"]',
      title: 'Backfill a story',
      content: 'Add a story the automated pipeline missed. Edits here are global — every team sees the change.',
    },
  ],
  stylePacks: [
    {
      target: '[data-tour="style-packs-create"]',
      title: 'Build a shared voice',
      content: 'Name it, describe its tone, then teach it with real example posts — any team can adopt it as their default.',
    },
  ],
};
