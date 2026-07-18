## Why

Every LLM call in this codebase (14 `chatCompletion` sites, 11 `embed` sites) is hardwired to a single
provider (OpenRouter) and a static 3-slot model config (`LLM_MODEL_STANDARD`/`CONTENT`/`FALLBACK`) read once
from `.env` at process startup. The user explicitly asked for a real, dynamic, secure, multi-provider system —
"Manage news related env values and models, open router api keys, dynamically and securely from frontend super
admin dashboard... API key management, Model management, openrouter, claude, chatgpt etc anything that users
want to. by superadmin. Globally available for all teams... Need a sdk kind of system" — none of which is
possible while providers/models are compile-time env values.

This change builds the foundational registry and credential storage only. It deliberately does **not** touch
any live serving path yet (`llmClient.ts`'s `chatCompletion`, `embeddings.ts`'s `embed` keep working exactly as
today throughout this change) — that migration is Track A2's job, kept separate so a bug in the new provider
layer can never take down live content generation while this piece is still being built and tested.

## What Changes

- New `backend/src/app/lib/crypto.ts` — AES-256-GCM encrypt/decrypt, restoring the exact versioned,
  self-describing scheme (`v1:<iv>:<authTag>:<ciphertext>`, all base64) that existed in this codebase's own
  git history (deleted in commit `ac9cab9` alongside the old `PlatformCredential` module) before this change
  re-adds it — not reinvented, since that shape was already reviewed and accepted once.
- New `CREDENTIAL_ENCRYPTION_KEY` required env var (32 bytes, base64 or hex), validated at startup — same zod
  validation restored from the same deleted precedent.
- New `LlmProvider` module (`backend/src/app/modules/LlmProvider/`): `LlmProvider` (provider_type, one or more
  encrypted API keys, `is_active`) and `LlmModel` (a curated per-provider model catalog entry: model id string,
  display name, capability tags, `is_active`) — mirroring `StylePack`/`StyleExample`'s one-module-two-schemas
  shape.
- Three concrete provider adapters behind one shared interface (`chatCompletion`/`embed`): OpenRouter (today's
  code moved behind the interface, unchanged behavior), Anthropic (new `@anthropic-ai/sdk` dependency,
  chat-only), OpenAI (`openai` SDK, both chat and embeddings).
- Super-admin-only CRUD API for providers, keys, and models. List/read responses mask keys to their last 4
  characters (`key_last4`); a separate `POST /llm-providers/:id/keys/:keyId/reveal` (super-admin-only) decrypts
  and returns the real value — the exact "reversible encryption, masked by default, explicit reveal" pattern
  the deleted `PlatformCredential` module used.
- **BREAKING (env)**: `CREDENTIAL_ENCRYPTION_KEY` becomes a required env var (previously did not exist in the
  current codebase; it existed before the `ac9cab9` deletion). Deployments must set it before this change's
  code can boot. No other breaking change — every existing LLM call site is untouched.

## Capabilities

### New Capabilities
- `llm-provider-registry`: super-admin-managed catalog of LLM providers, encrypted API keys, and per-provider
  model catalogs, with a shared adapter interface for chat completion and embeddings across OpenRouter,
  Anthropic, and OpenAI. Zero integration into existing serving paths in this change.

### Modified Capabilities
(none — purely additive; existing `chatCompletion`/`embed` call sites and their behavior are unchanged)

## Impact

- **Affected code:** new `backend/src/app/lib/crypto.ts`; new `backend/src/app/modules/LlmProvider/`
  (interface/model/validation/service/controller/route, plus 3 adapter files); new `@anthropic-ai/sdk`
  dependency; `backend/src/app/config/index.ts` gains `CREDENTIAL_ENCRYPTION_KEY`; `backend/.env`/`.env.example`
  need the new var; API docs (`docs/schemas.ts`, a new `docs/llmProviderPaths.ts`); route registration in the
  main router.
- **Not affected:** `llmClient.ts`, `embeddings.ts`, `openrouterClient.ts`, and all 14+11 existing call sites —
  explicitly untouched until Track A2.
- **Depends on:** `requireSuperAdmin` (already exists in `middleware/auth.ts`); the `openai` SDK (already a
  dependency, v6.46.0).
