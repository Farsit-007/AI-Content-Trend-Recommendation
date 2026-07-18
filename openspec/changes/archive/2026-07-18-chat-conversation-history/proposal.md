## Why

Every chat turn is already persisted to `ChatMessage` (`team_id`, `conversation_id`, `role`,
`content`, `created_at` — see `chat.model.ts`) and used server-side to build follow-up context
(`fetchConversationHistory` in `chat.retrieval.ts`). But there is no way to ever read it back: the
`Chat` module exposes exactly one route, `POST /chat` (`chat.route.ts`) — no `GET`. The frontend
mirrors this gap: `Chat.tsx` initializes `messages` as an empty array on every mount and never
fetches anything from the server; navigating away and back to `/dashboard/chat`, or reloading the
page, loses the entire visible conversation even though it still exists in the database. "Chat
history should be stored" is already true at the data layer — the gap is that it is write-only.

## What Changes

- Add `GET /chat/conversations` (team-scoped): lists this team's past conversations, most recent
  first, each with its `conversation_id`, a short preview of the last message, message count, and
  last-activity timestamp — derived from `ChatMessage` via aggregation, no new collection.
- Add `GET /chat/conversations/:conversationId` (team-scoped, `assertTeamAccess`): returns the full
  ordered message list for one conversation.
- `Chat.tsx`: on mount, load the team's most recent conversation (if any) and resume it instead of
  always starting blank; add a lightweight way to see/switch to a past conversation and to start a
  fresh one explicitly.
- **No change** to `POST /chat`'s request/response shape or to how context/history is assembled for
  the LLM — this proposal is purely about making already-stored history readable, not about
  changing chat's grounding behavior.

## Capabilities

### New Capabilities
- `chat-conversation-history`: what conversation history a team can list and retrieve, and how the
  frontend resumes/browses it.

### Modified Capabilities

_None — no main specs exist yet for this area._

## Impact

- **Backend:** `chat.route.ts` (two new `GET` routes), `chat.controller.ts`, `chat.service.ts` (new
  read-only functions — `listConversations`/`getConversationMessages`), `chat.interface.ts`
  (response types). No schema change to `ChatMessage` — it already has everything needed.
- **Frontend:** `lib/api/chat.ts` (two new client functions), `Chat.tsx` (load-on-mount +
  conversation switcher UI), possibly a small new component for the conversation list.
- **No breaking changes** — purely additive new endpoints and new frontend behavior.
