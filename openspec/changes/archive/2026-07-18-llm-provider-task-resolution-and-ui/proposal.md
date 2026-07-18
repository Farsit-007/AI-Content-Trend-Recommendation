## Why

`llm-provider-registry-foundation` (A1) built a real multi-provider registry, encrypted key storage, and a
model catalog — but nothing in the app actually uses it yet. Every one of the 14+11 real `chatCompletion`/
`embed` call sites this codebase has is still hardwired to the static `.env`-configured OpenRouter client. The
user's original ask ("Model choosing while content generation and other team related tasks where needed...
Globally available for all teams") is only realized once those call sites resolve their model dynamically and
a super-admin/team can actually change what's used without a redeploy.

## What Changes

- New `backend/src/app/lib/modelResolution.ts`: `resolveModelForTask(task, context)` — a 4-tier resolver
  (request override → team default → global task default → `.env` bootstrap), plus `chatCompletionForTask`/
  `embedForTask`/`embedBatchForTask` convenience wrappers that call sites actually use.
- New `LlmTaskDefault` sub-resource (in the existing `LlmProvider` module): super-admin-managed, one row per
  task, pointing at an `LlmModel` catalog entry.
- `Team.default_models: Record<string, string>` (task → `LlmModel` id) — per-task, not one field.
- `GenerateContentRequest`/`RefineContentRequest` gain an optional `llm_model_id` (request-level override).
- Every real `chatCompletion`/`embed`/`embedBatch` call site (10 chat-completion sites, 11 embedding sites —
  enumerated in design.md) migrated to the new task-based resolvers. The bake-off harness's literal per-cell
  model comparison is a deliberate exception (see design.md Non-Goals).
- `LlmProviderAdapter` gains `embedBatch` (OpenRouter/OpenAI support it natively; Anthropic throws, same as
  `embed`).
- New super-admin frontend page (`AIProviders.tsx`): provider/key/model CRUD (from A1) plus per-task global
  default assignment.
- `GenerateControls.tsx` gains a model picker dropdown, mirroring the existing style-pack picker exactly.
- **BREAKING (none)**: cold-start behavior (zero `LlmProvider` records configured) is byte-for-byte identical
  to today — the bootstrap tier delegates to the existing, unmodified `chatCompletion`/`embed`/`embedBatch`
  from `llmClient.ts`/`embeddings.ts`, which keep working exactly as before for every existing deployment.

## Capabilities

### New Capabilities
- `llm-task-model-resolution`: dynamic, per-task model/provider resolution across request/team/global/bootstrap
  tiers, with automatic failover to the next available key on a transient provider failure.

### Modified Capabilities
- `llm-provider-registry` (from A1): gains the `LlmTaskDefault` sub-resource and `embedBatch` on the adapter
  interface — additive to the existing registry, no existing A1 requirement changes behavior.

## Impact

- **Affected code:** `lib/modelResolution.ts` (new); `LlmProvider` module gains `LlmTaskDefault`
  interface/model/service/controller/route additions; `Team.interface.ts`/`.model.ts`; `contentGeneration.interface.ts`/
  `.validation.ts`; every module listed in design.md's call-site table; `docs/schemas.ts`/`llmProviderPaths.ts`;
  new frontend `AIProviders.tsx` + route entry in the super-admin sidebar; `GenerateControls.tsx`, `Generate.tsx`.
- **Not affected in behavior:** `llmClient.ts`, `embeddings.ts`, `openrouterClient.ts` remain unmodified — they
  become the bootstrap tier's implementation, not something this change edits.
- **Depends on:** `llm-provider-registry-foundation` (A1) — `LlmProvider`, `LlmModel`, `getAdapter`,
  `LlmProviderAdapter` all reused directly.
