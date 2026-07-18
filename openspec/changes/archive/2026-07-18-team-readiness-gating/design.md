# Design — Team Readiness Gating

## Context

**Overlaps with `chat-retrieval-topical-coverage`:** that change reworks `fetchNewsContext`'s
pooling logic inside `chat.retrieval.ts`. This change only adds an early-return guard at the top
of `chat.service.ts::askChat`, before retrieval is ever called — no shared lines, no ordering
requirement between the two beyond keeping the readiness check first.

`Team.subscribed_categories` defaults to `[]` and is treated as "no filter" everywhere it's read
(`newsItem.service.ts`, auto-gen's news selection). That's a reasonable default for "show
everything" but a poor default for "this team hasn't told us what it wants yet" — the two states
are currently indistinguishable. `BrandVoiceExample` existence is already used once (auto-gen) as a
proxy for "this team is configured," so the precedent for gating on it exists; this change just
makes the concept explicit, named, and applied consistently.

## Goals / Non-Goals

**Goals:**
- One computable, testable definition of "ready" reused everywhere gating is needed.
- Feed and Chat degrade to a clear "finish setup" state instead of an unfiltered/ungrounded one.
- No change to the global ingestion/scoring pipeline — it stays team-agnostic.

**Non-Goals:**
- No onboarding wizard UI (out of scope; Team Settings already has the four sections needed —
  Category Subscriptions, Brand Voice, Voice Profile, Style Pack — this change just gates on two
  of them being non-empty).
- No per-team ingestion (still one shared pool).
- Not touching admin/super_admin feed access — admins already bypass team-scoping in several
  places (`assertTeamAccess`); readiness gating applies to team-scoped reads only, and an admin
  explicitly querying `?team_id=` still gets the readiness response if that team isn't ready (the
  point is signaling to fix the team, not a security boundary).

## Decisions

1. **Readiness = `subscribed_categories.length > 0 AND BrandVoiceExample.exists(team)`.** Both are
   already-modeled, already-required-for-good-output signals — no new fields. Style pack and
   voice_profile.custom_instructions stay optional (both already have safe defaults/fallbacks).
   Alternative considered: a new explicit `Team.onboarding_completed: boolean` toggle — rejected as
   redundant state that can drift from the actual data (a team could flip it true without actually
   having examples).
2. **Compute readiness in one shared helper** (`team.service.ts::isTeamReady(teamId)` or similar),
   called from `newsItem.service`, `chat.service`, and `generatedContent.job`. Single source of
   truth, matches the codebase's existing "small shared helper, no framework" style
   (`resolveVoiceOptions`, `resolveStylePack`).
3. **Feed response shape for not-ready teams**: keep `GET /news-items` returning its existing
   paginated envelope shape but with `data: []` and add a top-level `team_ready: false` (additive
   field, non-breaking for clients that ignore unknown keys) rather than a different HTTP status —
   this isn't an error, it's an empty-but-valid state, consistent with how empty results are
   already handled elsewhere.
4. **Chat short-circuits before any LLM/embedding call** for a not-ready team — saves a wasted call
   and gives an immediate, deterministic response, not a model-dependent "I don't have enough
   context" answer.
5. **Admins/super_admins are not exempted from the readiness signal** when acting on behalf of a
   specific team (still see `team_ready: false`) — the flag is informational, not an access
   control; `assertTeamAccess` (unchanged) still lets them through to see it.

## Risks / Trade-offs

- [A team that already has data before this ships suddenly loses its feed if it never explicitly
  set categories] → audit existing teams' `subscribed_categories`/`BrandVoiceExample` before
  rollout (task 1.4). **Confirmed concretely, not assumed:** `seedDemoAccounts.ts` seeds 2
  brand-voice examples but explicitly sets `subscribed_categories: []` on insert — the demo team
  would fail readiness under this change as written today. Task 1.4 fixes the seed to also set a
  non-empty default category list, not just "audit and see."
- [Chat's fixed guidance message needs i18n-appropriate phrasing] → reuse `resolveVoiceOptions`'s
  language resolution so the guidance message honors the team's language even though it skips the
  LLM.
- [Historical `NewsItem` scores/categories predate this concept and may look stale post-rollout] →
  tracked as an explicit, confirmed-before-running operator task (not automatic), see tasks.md.

## Migration Plan

1. Ship the helper + gating (backward compatible additive field).
2. Operator manually reviews and clears the `NewsItem` collection (task 3) — requires explicit
   confirmation, not run by CI/deploy.
3. Next scheduled ingestion run repopulates from scratch.

Rollback: revert the gating commit; readiness helper is pure and side-effect-free, safe to leave
dormant if reverted.

## Open Questions

- Should `custom_categories` count toward readiness once §6.5 of the earlier status report
  (custom-category matching) is resolved? Deferred until that capability exists.
