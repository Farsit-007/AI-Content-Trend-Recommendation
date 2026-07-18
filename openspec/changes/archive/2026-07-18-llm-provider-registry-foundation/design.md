## Context

Every LLM interaction today goes through `backend/src/app/lib/llmClient.ts` (`chatCompletion`, hardwired to
`openrouterClient.ts`'s single `OpenAI`-SDK-pointed-at-OpenRouter instance) and `lib/embeddings.ts` (`embed`/
`embedBatch`, same client). Models are three static strings from `.env`
(`LLM_MODEL_STANDARD`/`CONTENT`/`FALLBACK`), read once at process startup via `config/index.ts`'s zod schema.
There is currently no way to add a second provider, rotate/add API keys without redeploying, or let a
super-admin choose what model backs a given task — everything is a compile-time `.env` value.

This codebase already solved the adjacent problem once: `PlatformCredential` (deleted in commit `ac9cab9`
alongside an unrelated analytics-feature removal) stored per-team social-platform tokens with AES-256-GCM
encryption, masked list views, and an explicit reveal endpoint. That code is fully recoverable from git history
and was already reviewed/accepted for this exact shape — this change restores the crypto layer verbatim and
reuses the same CRUD-with-reveal pattern for LLM provider keys instead of reinventing either.

## Goals / Non-Goals

**Goals:**
- A real multi-provider abstraction: one `LlmProviderAdapter` interface, three concrete implementations
  (OpenRouter, Anthropic, OpenAI).
- Encrypted, multi-key-per-provider credential storage, masked by default, explicit reveal only.
- A curated per-provider model catalog (`LlmModel`) that captures what each model can do (`chat`/`embedding`)
  without inventing a fixed "role" enum — that mapping is Track A2's job.
- Full CRUD + reveal, super-admin-only, fully tested in isolation.

**Non-Goals:**
- No integration into `chatCompletion`/`embed` or any of their 14+11 call sites — explicitly Track A2.
- No task-based resolution logic (request override → team default → global default) — Track A2.
- No frontend UI for this registry — Track A2 (the plan groups UI with the wiring that makes it meaningful to
  use, not with the backend-only foundation).
- No smart key-rotation policy (round-robin, least-used, etc.) — always uses the first `is_active` key for a
  provider; a smarter policy is deferred until real usage shows it's needed.

## Decisions

### 1. Restore `lib/crypto.ts` verbatim from git history, not reinvented

```ts
// AES-256-GCM, versioned + self-describing: v1:<iv-b64>:<authTag-b64>:<ciphertext-b64>
export const encrypt = (plaintext: string): string => { /* ... */ };
export const decrypt = (payload: string): string => { /* ... */ }; // throws on tampered/malformed payload
```
Pulled from `git show ac9cab9^:backend/src/app/lib/crypto.ts` unchanged. Same `decodeKey` helper restored in
`config/index.ts` (accepts base64 or hex, requires exactly 32 bytes) and the same `CREDENTIAL_ENCRYPTION_KEY`
zod validation. Rationale: this exact scheme was already designed, reviewed, and running in production for
`PlatformCredential`'s tokens — there is no reason to design a second encryption scheme for a second kind of
secret in the same codebase.

### 2. `LlmProvider` + `LlmModel` in one module, mirroring `StylePack`/`StyleExample`

Both schemas live in `backend/src/app/modules/LlmProvider/llmProvider.model.ts` (two `Schema`s, two `model()`
calls, one file) — the exact convention already used for `StylePack`/`StyleExample` in this codebase. Not two
separate module directories: `LlmModel` only ever makes sense in the context of its parent `LlmProvider`
(routes are nested: `/llm-providers/:providerId/models`), same relationship shape as
`StylePack`/`StyleExample`.

```ts
interface ILlmProviderKey {
  _id: Types.ObjectId;
  encrypted_key: string;   // select: false
  key_last4: string;
  label?: string;          // e.g. "primary", "backup" — operator-assigned, optional
  is_active: boolean;
  created_at: Date;
}

interface ILlmProvider {
  provider_type: 'openrouter' | 'anthropic' | 'openai';
  name: string;             // display label, e.g. "OpenRouter (primary)"
  keys: ILlmProviderKey[];
  is_active: boolean;       // provider-level kill switch, independent of individual key state
  created_at: Date;
  updated_at: Date;
}

interface ILlmModel {
  provider_id: Types.ObjectId;
  model_id: string;         // the literal string passed to the provider API, e.g. "anthropic/claude-3-5-sonnet"
  display_name: string;
  capabilities: ('chat' | 'embedding')[];
  is_active: boolean;
  created_at: Date;
}
```
Keys are a subdocument array on `LlmProvider` (not a separate collection) because a key has no independent
existence or query pattern outside its provider — same reasoning as embedding `keys[]` directly rather than a
`LlmProviderKey` collection. `encrypted_key` is `select: false` on the subdocument schema, matching
`PlatformCredential.encrypted_token`'s `select: false` — list/read responses naturally exclude it without the
service layer having to remember to strip it.

### 3. One shared adapter interface, three concrete implementations

```ts
interface LlmProviderAdapter {
  chatCompletion(model: string, messages: ChatMessage[], temperature: number): Promise<string>;
  embed(model: string, text: string): Promise<number[]>;
}
```
- **OpenRouter** (`llmProvider.adapters.openrouter.ts`): thin wrapper around the existing `openai` SDK pointed
  at `https://openrouter.ai/api/v1` — today's `openrouterClient.ts` logic, moved behind the interface,
  unchanged (same timeout/retry/header config). The *existing* `openrouterClient.ts`/`llmClient.ts`/
  `embeddings.ts` are **not modified or deleted** in this change — they keep serving every live call site
  exactly as today; this adapter is a new, separate, additive implementation of the same underlying pattern for
  the *new* registry to use once Track A2 wires it in.
- **Anthropic** (`llmProvider.adapters.anthropic.ts`): new `@anthropic-ai/sdk` dependency. `chatCompletion`
  maps the shared `ChatMessage[]` to Anthropic's `messages.create` shape (system message extracted separately,
  Anthropic's API takes `system` as a top-level param, not a message role). `embed` throws
  `Error('anthropic does not support embeddings')` — Anthropic has no embeddings endpoint; this is a real
  capability gap, not an oversight, and is exactly what `LlmModel.capabilities` exists to make visible in the
  catalog before A2 ever tries to route an embedding task there.
- **OpenAI** (`llmProvider.adapters.openai.ts`): the `openai` SDK pointed at OpenAI's real base URL (no
  `baseURL` override), supports both `chatCompletion` and `embed`.

An adapter resolver (`llmProvider.adapters.ts`) maps `provider_type` → the concrete adapter, given a decrypted
API key: `getAdapter(providerType: string, apiKey: string): LlmProviderAdapter`.

### 4. CRUD + reveal API surface, super-admin-only throughout

```
POST   /llm-providers                              create a provider (provider_type, name)
GET    /llm-providers                               list providers (keys masked to key_last4, no encrypted_key)
GET    /llm-providers/:id                            read one provider (same masking)
PATCH  /llm-providers/:id                            update name/is_active
DELETE /llm-providers/:id                            delete a provider (cascades its LlmModel rows)
POST   /llm-providers/:id/keys                       add a key (plaintext in request body, encrypted at rest)
DELETE /llm-providers/:id/keys/:keyId                 remove a key
PATCH  /llm-providers/:id/keys/:keyId                 toggle is_active / update label
POST   /llm-providers/:id/keys/:keyId/reveal          decrypt and return the real key (super-admin-only)
POST   /llm-providers/:id/models                      add a model (model_id, display_name, capabilities)
GET    /llm-providers/:id/models                      list a provider's models
PATCH  /llm-providers/:id/models/:modelId             update display_name/capabilities/is_active
DELETE /llm-providers/:id/models/:modelId             delete a model
```
Every route uses `requireAuth` + `requireSuperAdmin` (both already exist in `middleware/auth.ts`) — no
per-team scoping, since this is explicitly a global, platform-level registry per the user's own "globally
available for all teams" requirement.

### 5. Cascading delete for provider → models, not orphaned rows

Deleting an `LlmProvider` also deletes every `LlmModel` row with that `provider_id` in the same service-layer
call (two `deleteOne`/`deleteMany` calls in one service function, not a Mongo-level cascade — this codebase
doesn't use transactions/cascade hooks elsewhere, so a manual two-step delete matches existing conventions).

## Risks / Trade-offs

- **[Risk] A key becomes unrecoverable if `CREDENTIAL_ENCRYPTION_KEY` is ever lost/rotated without a migration
  plan** → Mitigation: this is the same risk `PlatformCredential` already accepted and shipped with; documented
  here as inherited, not new. Key rotation strategy (re-encrypt all rows under a new key) is out of scope for
  this change, same as it was for the original.
- **[Risk] `@anthropic-ai/sdk` is a new dependency with its own version-compatibility surface** → Mitigation:
  pinned to a specific version in `package.json`, and the adapter is fully unit-tested (mocked SDK) before
  anything depends on it.
- **[Trade-off] No key rotation/failover policy smarter than "first active key"** → Accepted per proposal;
  revisit only if real usage shows a need (matches the plan's explicit scoping).

## Migration Plan

- New required env var `CREDENTIAL_ENCRYPTION_KEY` must be set before this change's code can boot (zod
  validation fails startup otherwise, same as every other required env var in this codebase). Generate via
  `openssl rand -base64 32`, document in `.env.example`.
- No data migration — `LlmProvider`/`LlmModel` are brand-new collections, no existing data to move.
- Rollback: revert the code; the new collections are simply unused/ignored by the rest of the app, since
  nothing in the live serving path reads from them yet (that's the whole point of splitting A1 from A2).

## Open Questions

None — every design decision here either mirrors an already-accepted precedent in this codebase
(`PlatformCredential`'s encryption/masking/reveal shape, `StylePack`/`StyleExample`'s module structure) or is
explicitly scoped out to Track A2 per the original plan.
