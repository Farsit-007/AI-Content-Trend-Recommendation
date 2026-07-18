# Bangla Authenticity Close-Out (Track 0 + Gates G1/G3)

## Why

Every mechanism for authentic Bangla output exists (style packs, retrieval, style cards, bulk
import UI, bake-off harness, critique pass) but the launch packs still contain 3 AI-fabricated
posts and no quality gate has ever been run — so generated Bangla reads generic and "AI-ish", which
is the single biggest gap between the product and its vision ("like Bangladeshi tech writers would
have written"). This change turns the open loops in `BANGLA-QUALITY-DECISION.md` and the verified
status report (2026-07-18 §4.1–4.2, §4.4) into a tracked, finishable unit of work.

## What Changes

- Build 3+ real writer-style packs (Track 0), each with ≥30 real public posts loaded through the
  bulk-import admin UI, with `source_ref` and `engagement_hint` populated, and a generated style
  card.
- Run Gate G1 (Bangla style-example retrieval sanity) and record a verdict; only enable
  `STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY` if the verdict demands it.
- Run Gate G3 (blinded Bangla bake-off, `--critique both`) with at least one native-speaker
  reviewer; record the model decision and the critique-pass enable/disable decision in
  `BANGLA-QUALITY-DECISION.md`'s tables; apply the chosen model as the `content_generation` task
  default in the admin LLM settings.
- Add an automated language-fidelity regression test: the generation system prompt must carry the
  language-dominance clause whenever style/few-shot blocks are present, and refine must preserve
  draft language.

## Capabilities

### New Capabilities
- `bangla-style-authenticity`: corpus quality bar for launch style packs, gate execution/recording
  requirements, and language-fidelity guarantees for generated output.

### Modified Capabilities

_None — no main specs exist yet for this area._

## Impact

- Data: `StylePack`/`StyleExample` collections (real corpus), pack `style_card` fields.
- Docs: `BANGLA-QUALITY-DECISION.md` decision tables filled in; status report updated.
- Config/UI: `content_generation` task default set in admin LLM settings; possibly
  `CONTENT_CRITIQUE_ENABLED` / `STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY` flips (evidence-gated).
- Code: one new backend test file/section for language fidelity (prompt-level assertions in
  `contentGeneration.integration.test.ts` or a dedicated test).
- People: requires a native Bangla reviewer familiar with the target writers (e.g. Programming
  Hero's content) — the only non-engineering dependency.
