# Design — Dev Data Reset Tooling

## Context

Confirmed by enumerating every `model<...>(...)` call under `backend/src/app/modules/*/*.model.ts`
— exactly 16 collections exist, no more, no fewer: `users`, `teams`, `team_memberships`,
`news_items`, `news_dedup_ledger`, `news_item_category_overrides`, `ingestion_runs`,
`maintenance_runs` (retention/refresh run records), `generated_content`, `style_packs`,
`style_examples`, `brand_voice_examples`, `chat_messages`, `llm_providers`, `llm_models`,
`llm_task_defaults`. Two things that sound like collections but are not, worth being explicit
about so the script's scope isn't over-built: (a) `Stats` (`backend/src/app/modules/Stats/`) has
no model file of its own — `stats.service.ts` only reads/aggregates the collections above, so
resetting them already "resets" stats, nothing separate to delete; (b) the content-generation
fact-sheet cache lives in Redis, not Mongo, so a Mongo reset never touches it (see the Redis note
below). The existing scripts directory already has a consistent shape: standalone `ts-node`-run
files that `mongoose.connect`, do the work, then `process.exit`.

## Goals / Non-Goals

**Goals:**
- One command for "wipe everything except the super admin," one for "just news items" (the lighter
  case `team-readiness-gating` needs).
- Impossible to run silently/accidentally — always shows what it's about to delete, always requires
  explicit opt-in, always refuses in production.

**Non-Goals:**
- No UI/admin-panel button for this (scripts only) — a destructive full-wipe action belongs behind
  a terminal, not a misclick in a browser.
- No selective/partial reset beyond the two documented scopes (full vs. news-only) — more granular
  scopes can be added later if a real need shows up.
- Does not touch Redis (response cache, fact-sheet cache) — noted as a separate manual step
  (`redis-cli FLUSHDB`) in the script's own printed output, not automated, since Redis often also
  holds unrelated cache data an operator may want to keep.

## Decisions

1. **Two scripts, not one script with a `--scope` flag debate** — `resetDevData.ts` (everything but
   super admin) and `clearNewsItems.ts` (news + dedup ledger only) are different enough in blast
   radius that making them separate commands (separate names typed out) is itself a safety feature:
   you can't fat-finger `--scope=full` when you meant `--scope=news`.
2. **Safety gate order**: (a) refuse if `NODE_ENV === 'production'`, (b) print target DB host +
   per-collection current counts, (c) require `--yes` OR an interactive typed confirmation
   (`type the database name to confirm`) — mirrors how destructive CLI tools (e.g. `terraform
   destroy`) gate on typed confirmation, appropriate given this targets a real Atlas cluster in
   `.env`, not a local throwaway DB.
3. **Super admin preservation rule**: delete every `User` document where
   `role !== 'super_admin'`, not "keep the first user" or "keep by a specific email" — matches the
   proposal's literal ask and stays correct even if multiple super admins exist.
4. **Cascading consistency**: `resetDevData.ts` deletes `team_memberships` alongside `teams` (an
   orphaned membership pointing at a deleted team is worse than no membership) and
   `style_examples` alongside `style_packs`, mirroring the existing app-level cascade pattern in
   `llmProvider.service.ts::deleteProvider` (explicit two-step delete, not a Mongo transaction).

## Risks / Trade-offs

- [Run against the wrong environment by mistake] → the printed DB host + typed confirmation is the
  mitigation; also recommend operators visually confirm the host string matches the intended
  cluster before typing the confirmation phrase.
- [Redis staying stale after a Mongo reset (e.g. an old fact-sheet cached for a now-deleted news
  item)] → harmless (cache keyed by item id that no longer resolves to anything, just an unused
  key expiring naturally within its TTL), but the script prints a reminder to flush Redis if a
  fully clean state is wanted.
- [Scripts becoming out of sync with the model list as new modules are added] → add a comment at
  the top of `resetDevData.ts` listing the exact collections, so a future new module is an
  obvious one-line diff to remember, not a silent gap.

## Migration Plan

N/A — tooling addition only, no deploy/runtime impact.

## Open Questions

None.
