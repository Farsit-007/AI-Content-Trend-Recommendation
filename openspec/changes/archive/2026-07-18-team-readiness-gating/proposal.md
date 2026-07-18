# Team Readiness Gating

## Why

Today a newly created team with zero configuration (no subscribed categories, no brand-voice
examples, no style pack) sees the **entire unfiltered global feed** — every ingested item across
every category — because `subscribed_categories: []` is treated as "no filter" in
`newsItem.service.ts:74`. That's the opposite of the intended experience: a team should see a
feed curated to what it actually cares about, not everything, and definitely not before anyone has
told the system what "everything" should be narrowed to. The same gap exists for background jobs:
auto-generation already skips teams with no brand-voice examples, but news ingestion and the
engagement/retention crons run globally regardless of whether any team is even configured to
consume their output yet, and chat has no readiness gate at all.

## What Changes

- Define **team readiness** as a first-class, computed concept: a team is "ready" once it has (a)
  at least one `subscribed_categories` entry and (b) at least one `BrandVoiceExample`. (Style pack
  stays optional — content generation already has a working neutral-tone fallback.)
- **BREAKING (behavioral):** `GET /news-items` for a not-ready team SHALL return an explicit
  "team not ready" response (empty result + a `team_ready: false` flag) instead of the unfiltered
  global feed. Frontend Feed page shows a "complete your team setup" prompt linking to Team
  Settings instead of a flooded feed.
- Chat (`POST /chat`) for a not-ready team SHALL respond with a fixed guidance message (no LLM
  call) pointing to Team Settings, rather than grounding answers in the global item pool for a team
  that hasn't scoped itself yet.
- Auto-generation job: extend the existing brand-voice-only gate to the full readiness check
  (categories too) — small change, same gate location.
- News ingestion, engagement-refresh, and retention crons stay global/unchanged — they populate the
  shared item pool that *all* teams eventually draw from and have no per-team notion; only
  per-team-facing reads (feed, chat) and per-team writes (auto-gen) are gated.
- One-time data operation (tracked in tasks, not run automatically by this change): clear existing
  `NewsItem` documents so the first post-change ingestion run repopulates cleanly, since historical
  items were scored/categorized before any team readiness concept existed. This requires explicit
  operator confirmation before running against the live database — see tasks.md.

## Capabilities

### New Capabilities
- `team-readiness`: what makes a team "ready", where readiness is computed, and which team-facing
  reads/writes are gated by it.

### Modified Capabilities

_None — no main specs exist yet for this area._

## Impact

- `backend/src/app/modules/NewsItem/newsItem.service.ts` (readiness check + response shape),
  `backend/src/app/modules/Chat/chat.service.ts` (readiness short-circuit),
  `backend/src/app/modules/GeneratedContent/generatedContent.job.ts` (extend existing gate),
  `backend/src/app/modules/Team/` (new `isTeamReady` helper, likely exposed on `GET /teams/:id` for
  the frontend banner).
- `frontend/src/pages/dashboard/Feed.tsx`, `Chat.tsx` (not-ready empty states),
  `frontend/src/lib/api/news.ts`, `chat.ts` (response shape).
- Data: one-time `NewsItem` collection clear (operator-run, see tasks.md — NOT executed by this
  change automatically).
