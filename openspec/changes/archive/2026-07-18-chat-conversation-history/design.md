## Context

`ChatMessage` (`chat.model.ts`) already has a compound index `{ team_id: 1, conversation_id: 1,
created_at: 1 }` — exactly what both new read endpoints need (group-by-conversation within a team,
and ordered-by-time within a conversation), so no index migration is required. `chat.route.ts`
today has exactly one route: `POST /` behind `requireAuth`. `chat.service.ts::askChat` already has
`assertTeamAccess` (admin/super_admin bypass, otherwise requires membership in `requestingUser.
team_ids`) — the same check is reused verbatim for the two new read endpoints.

`Chat.tsx` currently: `useState<ChatTurn[]>([])` for messages, `useState<string | undefined>` for
`conversationId`, both starting empty/undefined on every mount. Nothing reads from the server before
the first message is sent.

## Goals / Non-Goals

**Goals:**
- A team's chat history, already durably stored, is actually retrievable and browsable.
- Reloading or navigating back to the Chat page resumes where the user left off by default.

**Non-Goals:**
- No change to how `POST /chat` builds context or answers — this is a read-path addition only.
- No cross-team or cross-user history sharing — a "conversation" here remains team-scoped exactly
  as messages already are; no per-user conversation ownership concept is introduced (multiple
  members of one team already see the same team-scoped conversations today via `fetchConversation
  History`, so this preserves existing semantics rather than inventing new ones).
- No message editing/deletion — read-only history for now.
- No pagination beyond a reasonable list cap for `GET /chat/conversations` (e.g. most recent 50) —
  revisit only if a real team accumulates enough conversations for it to matter.

## Decisions

1. **Two new endpoints, not a change to `POST /chat`'s response** — keeps the write path (already
   well-tested, per `chat.integration.test.ts`) untouched; history retrieval is purely additive.
2. **`GET /chat/conversations` computed via aggregation over `ChatMessage`, not a new
   `Conversation` collection.** A conversation today has no independent existence — it's implicitly
   defined by the set of messages sharing a `conversation_id`. Introducing a separate collection
   just to list them would require keeping it in sync with every `ChatMessage.create` call for no
   benefit at this scale (a `$group` aggregation on an already-indexed compound key is cheap).
   Alternative considered: store conversation metadata (title, last-activity) on a new lightweight
   document per conversation, updated on every message — rejected as premature; revisit only if the
   aggregation actually becomes a measured bottleneck.
3. **Frontend auto-resumes the single most recent conversation on mount** (per Goals), with an
   explicit "New chat" action to start fresh — mirrors the simplest interpretation of "chat history
   should be stored" (visible continuity) without over-building a full multi-conversation sidebar
   UI in the first pass. A conversation list/switcher (from `GET /chat/conversations`) is included
   so the history is actually *browsable*, not just auto-resumed — see tasks.md for the minimal
   version (a simple dropdown/list, not a redesigned Chat page layout).
4. **Reuses `assertTeamAccess` exactly as `askChat` already does** — no new authorization concept;
   a team member or admin/super_admin can read what `askChat` already lets them write.

## Risks / Trade-offs

- [Aggregation cost grows with total message volume] → bounded by the existing compound index and
  a result cap on the conversations list; revisit if this codebase's real usage volume ever grows
  enough to matter (no evidence it will at hackathon/demo scale).
- [Resuming the most recent conversation by default could surprise a user expecting a blank slate]
  → mitigated by the explicit "New chat" action being one click away, not by defaulting to blank
  and hiding history behind an extra step.

## Migration Plan

None — read-only additions over already-existing, already-indexed data. No backend behavioral
change to `POST /chat`. Rollback is a plain revert of the two new routes and the frontend's
load-on-mount behavior.

## Open Questions

- Should `GET /chat/conversations` truncate the "last message preview" to a fixed character count?
  A small implementation detail, not a design fork.
