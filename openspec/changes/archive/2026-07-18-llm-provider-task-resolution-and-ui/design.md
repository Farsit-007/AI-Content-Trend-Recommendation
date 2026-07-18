## Context

A1 shipped `LlmProvider`/`LlmModel` (encrypted keys, a model catalog, `getAdapter(providerType, apiKey)`) with
zero integration into live serving. Every real call site today still imports `LLM_MODELS`/`chatCompletion` from
`llmClient.ts` or `embed`/`embedBatch` from `embeddings.ts`, both hardwired to the single `.env`-configured
OpenRouter client. This change is the wiring — resolve a model dynamically per task, per team, with a safe
cold-start fallback, and touch every real call site.

**Full call-site inventory** (grepped directly against the current tree, not estimated):

| File | Line(s) | Kind | Task | Team context available? |
|---|---|---|---|---|
| `Chat/chat.service.ts` | 27, 44 | embed, chatCompletion | `embedding`, `chat` | yes (`payload.team_id`) |
| `NewsIngestion/newsIngestion.categorize.ts` | 50 | chatCompletion | `categorization` | no |
| `NewsIngestion/newsIngestion.adjudicate.ts` | 57 | chatCompletion | `dedup_adjudication` | no |
| `NewsIngestion/newsIngestion.utils.ts` | 124 | embedBatch | `embedding` | no |
| `StylePack/stylePack.service.ts` | 126 | chatCompletion | `style_card` | no |
| `StylePack/stylePack.embeddingStrategy.ts` | 32, 62, 67, 70, 93, 153 | chatCompletion, embed×3, embedBatch×2 | `style_card` (summary extraction), `embedding` | no |
| `ContentGeneration/contentGeneration.critique.ts` | 99 | chatCompletion | `critique` | yes (threaded through) |
| `ContentGeneration/contentGeneration.facts.ts` | 50 | chatCompletion | `fact_extraction` | no (shared by team + bake-off callers) |
| `ContentGeneration/contentGeneration.service.ts` | 165, 194, 245 | embed, chatCompletion×2 | `embedding`, `content_generation`×2 | yes (`payload.team_id`) |
| `ContentGeneration/contentGeneration.bakeoff.ts` | 145, 173 | embed, chatCompletion | `embedding`, *(excluded, see Non-Goals)* | no |
| `BrandVoiceExample/brandVoiceExample.service.ts` | 20 | embed | `embedding` | yes (`payload.team_id`) |
| `NewsItem/newsItem.service.ts` | 40 | embed | `embedding` | no |
| `lib/verifyConnections.ts` | 32, 39 | chatCompletion, embed | `content_generation`, `embedding` | no |

10 chat-completion call sites (11 counting the excluded bake-off cell), 11 embedding call sites — matches the
plan's rough count.

## Goals / Non-Goals

**Goals:**
- Every real call site resolves its model/provider dynamically through one shared resolver.
- Cold start (zero `LlmProvider` records) is behaviorally identical to today, not just "similar."
- A super-admin can set a global default per task; a team can override per task; a request can override that.
- Failover retries on the next available active key, not a second hardcoded model string.

**Non-Goals:**
- **The bake-off harness's per-cell comparison call (`contentGeneration.bakeoff.ts:173`) is explicitly NOT
  migrated to task-based *default* resolution.** Its entire purpose is comparing caller-supplied literal model
  strings against each other — task-based resolution picks *a* model for a task; bake-off's job is bypassing
  that to test specific ones. It still needs to route each literal model to the right provider, which this
  change does via a separate, narrow `resolveProviderForLiteralModel(modelId)` helper (checks the `LlmModel`
  catalog for a matching `model_id`; falls back to OpenRouter + the bootstrap key if not found — preserving
  100% of today's OpenRouter-only bake-off behavior when the catalog is empty, while unlocking cross-provider
  bake-offs once catalog entries exist).
- No usage/cost tracking dashboard — flagged in plan file 10 §3 as a reasonable future follow-up, not this
  change.
- No smarter failover policy than "next available active key" — same scope limit as A1.

## Decisions

### 1. Requests/teams reference an `LlmModel` catalog row by id, not a raw model-id string

The proposal input mentioned "model_id/provider_id" as two separate request fields; this design uses **one**
field instead: `llm_model_id` (an `LlmModel` document `_id`). Rationale: a raw model-id string
(`"claude-3-5-sonnet"`) is ambiguous — nothing prevents two providers from having catalog entries with
similar/colliding strings, and validating "this model_id belongs to this provider_id" as two independent
fields is extra surface for a mismatched pair to slip through. A single `LlmModel._id` reference is atomic: one
lookup yields both the provider and the model string together, guaranteed consistent, and is exactly what the
frontend picker already naturally produces (the dropdown lists catalog entries, submits the chosen one's id) —
same shape as `style_pack_id` already works today.

`Team.default_models` uses the same shape: `Record<string, string>` where each value is an `LlmModel._id`
string, keyed by task name.

### 2. `resolveModelForTask`: 4-tier, soft-fail through every tier, one shared function

```ts
export type LlmTask =
  | 'content_generation' | 'chat' | 'categorization' | 'dedup_adjudication'
  | 'style_card' | 'critique' | 'fact_extraction' | 'embedding';

interface ResolveContext {
  teamId?: string;
  requestModelId?: string; // an LlmModel._id, from the request's llm_model_id
}

interface ResolvedModel {
  source: 'request' | 'team' | 'global' | 'bootstrap';
  provider_type: LlmProviderType;
  model_id: string;      // the literal string passed to the provider API
  api_key: string;       // decrypted, ready to hand to getAdapter
  key_id?: string;       // undefined only for the bootstrap tier
}

export const resolveModelForTask = async (
  task: LlmTask,
  context: ResolveContext = {},
): Promise<ResolvedModel> => { /* ... */ };
```

Resolution order, each tier validated (referenced `LlmModel` exists, `is_active`, has the required capability
for `task` — `embedding` vs `chat`; its parent `LlmProvider` is `is_active` and has at least one `is_active`
key) before being accepted — an invalid/inactive reference at any tier logs a warning and falls through to the
next tier, exactly the same soft-fail philosophy `resolveStylePack`/`resolveVoiceOptions` already use in this
codebase, never a hard request error:
1. **Request**: `context.requestModelId`, if set.
2. **Team**: `Team.findById(context.teamId).default_models[task]`, if `context.teamId` is set and a mapping
   exists for `task`.
3. **Global**: `LlmTaskDefault.findOne({ task })`.
4. **Bootstrap**: always succeeds. Returns `{ source: 'bootstrap', provider_type: 'openrouter', model_id:
   <the same static value LLM_MODELS/config.embedding_model already resolve today for this task>, api_key:
   config.openrouter_api_key }`. This is the literal `.env` values this codebase already has — nothing new to
   configure for an existing deployment.

### 3. Bootstrap tier delegates to the existing static functions, not a reimplementation

```ts
export const chatCompletionForTask = async (
  task: LlmTask,
  messages: AdapterChatMessage[],
  opts: { teamId?: string; requestModelId?: string; temperature?: number } = {},
): Promise<string> => {
  const resolved = await resolveModelForTask(task, opts);
  if (resolved.source === 'bootstrap') {
    // Delegates to the existing, already-tested static-config path — including its own
    // LLM_MODEL_FALLBACK retry — rather than reimplementing that logic here. True behavioral
    // identity with today for any deployment with zero LlmProvider records configured.
    return chatCompletion({ model: resolved.model_id, messages, temperature: opts.temperature ?? 0.7 });
  }

  const adapter = getAdapter(resolved.provider_type, resolved.api_key);
  try {
    return await adapter.chatCompletion(resolved.model_id, messages, opts.temperature ?? 0.7);
  } catch (primaryErr) {
    // Failover retries on the next available active key/model the resolver would pick,
    // excluding the one that just failed — design decision 5 of the original plan.
    const retry = await resolveModelForTask(task, { ...opts, excludeKeyId: resolved.key_id });
    if (!retry || retry.key_id === resolved.key_id) throw primaryErr;
    return getAdapter(retry.provider_type, retry.api_key).chatCompletion(retry.model_id, messages, opts.temperature ?? 0.7);
  }
};
```
`embedForTask`/`embedBatchForTask` mirror this exactly, delegating to `embed`/`embedBatch` on the bootstrap
tier. This is why `llmClient.ts`/`embeddings.ts`/`openrouterClient.ts` are never modified by this change — they
become an implementation detail of one branch inside the new resolvers, not something migrated away from.

`resolveModelForTask` accepts an optional `excludeKeyId` to make the retry re-resolve to a *different* active
key (skips the one just proven bad), rather than deterministically re-picking the same one.

### 4. `LlmTaskDefault`: one row per task, lives in the existing `LlmProvider` module

```ts
interface ILlmTaskDefault {
  task: LlmTask;           // unique
  llm_model_id: Types.ObjectId;
  updated_at: Date;
}
```
`GET /llm-providers/task-defaults`, `PUT /llm-providers/task-defaults/:task` (super-admin-only) — a small
addition to the existing `llmProvider.route.ts`/`.service.ts`/`.controller.ts`, not a new module, matching A1's
"closely-related sub-resources live together" convention (mirrors `LlmModel` living alongside `LlmProvider`).

### 5. `LlmProviderAdapter` gains `embedBatch`

A1 only defined `embed` (A1 had no batch call site to satisfy). This change adds
`embedBatch: (model: string, texts: string[]) => Promise<number[][]>` to the shared interface: OpenRouter/
OpenAI implement it via their SDK's native array-input embeddings call (mirrors `embeddings.ts`'s existing
`embedBatch`); Anthropic throws the same "does not support embeddings" error as `embed`.

### 6. Embedding-model swaps are schema-guarded, not newly defended against

Every embedding-consuming schema (`NewsItem`, `StyleExample`, `BrandVoiceExample`) already validates
`embedding.length === 1536` at the Mongoose level. If a super-admin points the `embedding` task's global/team
default at a model producing a different dimension, the very next write throws a clear Mongoose validation
error — data is never silently corrupted. This change relies on that pre-existing guardrail rather than adding
new dimension-checking logic; documented here as a deliberate reliance, not an oversight. Practically, a
production deployment should only swap the embedding task's model as part of a deliberate, planned re-embedding
migration — not a casual choice — same caveat as any embedding-model change already carries.

### 7. `critiqueText`/`extractFactSheet` gain an optional `teamId` parameter, threaded from their callers

`critiqueText(draft, styleCard, voiceOptions)` → `critiqueText(draft, styleCard, voiceOptions, teamId?)`;
`extractFactSheet`/`getOrExtractFactSheet` gain the same optional trailing param. Both already have team
context available in their only real caller (`contentGeneration.service.ts`); the bake-off harness's call to
`getOrExtractFactSheet` simply omits it (global-tier resolution only, matching its existing no-team-context
nature).

### 8. Frontend: `AIProviders.tsx` mirrors the `StylePacks.tsx` admin page shape; `GenerateControls.tsx` gains a model dropdown mirroring the style-pack picker exactly

New route entry in `routes/supperAdmin.routes.tsx` (existing typo preserved — matches the existing file name)
under a new sidebar item. The page has three sections (providers+keys, models per provider, task defaults),
each following the existing `StylePacks.tsx` CRUD-table-plus-dialog pattern already established in this
codebase — no new UI primitives needed. `GenerateControls.tsx`'s new model dropdown: same `useQuery` + `Select`
shape as the existing `stylePackId`/`onStylePackChange` prop pair, sourced from a new `listActiveModels()` API
call (`GET /llm-providers` + client-side flatten, or a new lightweight `GET /llm-providers/models/active`
convenience endpoint — the latter, since the frontend picker only ever needs active, chat-capable models, not
the full masked-provider CRUD shape).

## Risks / Trade-offs

- **[Risk] A super-admin misconfigures a task's global default to an inactive/wrong-capability model** →
  Mitigated by the soft-fail-through-tiers design (decision 2) — the resolver silently falls through to
  bootstrap rather than hard-failing every request for that task; a warning is logged so it's discoverable, not
  silent forever.
- **[Risk] Anthropic/OpenAI adapters remain live-unverified in this deployment** (no credentials configured,
  inherited from A1) → Same accepted, flagged-for-later state as A1; this change's own live verification is
  scoped to what's actually testable here (OpenRouter, end-to-end through the new resolver).
- **[Trade-off] The bake-off harness's cross-provider capability is limited to "falls back to OpenRouter if the
  literal model string isn't in the catalog"** → Accepted; true cross-provider bake-off UX (e.g. a provider
  picker per model in the bake-off request) is a future enhancement to that harness specifically, not required
  by this change's actual goal (wiring the task resolver, not enhancing bake-off).

## Migration Plan

- No data migration — `LlmTaskDefault` is a new empty collection; `Team.default_models` defaults to `{}` for
  every existing team (no default entries, exactly matching "nothing configured" cold start).
- Every existing deployment with zero `LlmProvider` records keeps working identically post-deploy (bootstrap
  tier). A super-admin opts in per task, per team, or per request at their own pace — nothing forces migration.
- Rollback: revert the code. `LlmTaskDefault`/`Team.default_models` become unused/ignored; no destructive
  change to roll back.

## Open Questions

None — every design decision here resolves an ambiguity from the original plan's proposal input explicitly
(the model_id/provider_id → single llm_model_id simplification, the bake-off harness's exclusion, the
embedding-dimension-swap risk) rather than leaving it implicit.
