## 1. Backend: list conversations

- [x] 1.1 `chat.service.ts`: add `listConversations(teamId)` — aggregate `ChatMessage` grouped by
      `conversation_id` within `team_id`, returning `{ conversation_id, last_message, message_count,
      last_activity_at }` sorted by `last_activity_at` descending, capped at a reasonable limit
      (e.g. 50).
- [x] 1.2 `chat.controller.ts` + `chat.route.ts`: add `GET /chat/conversations` (query param
      `team_id`), `assertTeamAccess`-gated same as `askChat`.
- [x] 1.3 `chat.interface.ts`: add the response type for a conversation summary.

## 2. Backend: get one conversation's messages

- [x] 2.1 `chat.service.ts`: add `getConversationMessages(teamId, conversationId)` — reuses the
      existing `ChatMessage.find({ team_id, conversation_id }).sort({ created_at: 1 })` pattern
      already used by `fetchConversationHistory`, but unbounded (or a much higher cap) since this is
      a full-history read, not the LLM context window's `HISTORY_LIMIT`.
- [x] 2.2 `chat.controller.ts` + `chat.route.ts`: add
      `GET /chat/conversations/:conversationId` (query param `team_id`), same access gate.
- [x] 2.3 Confirm a `conversationId` from a different team returns an empty/404 result, not another
      team's messages — add a test for this specifically.

## 3. Backend tests

- [x] 3.1 Integration tests for both new routes: list ordering, empty-history case, cross-team
      isolation, unauthenticated rejection. 17/17 passing in `chat.integration.test.ts` (10 new
      tests added for the two new endpoints).

## 4. Frontend

- [x] 4.1 `lib/api/chat.ts`: add `listConversations(teamId)` and
      `getConversationMessages(teamId, conversationId)` client functions + response types.
- [x] 4.2 `Chat.tsx`: on mount (when `teamId` resolves), fetch the most recent conversation via
      `listConversations` and, if one exists, load its messages via `getConversationMessages` into
      the existing `messages`/`conversationId` state instead of starting empty. Guarded by a
      `hasAutoResumedRef` so it fires exactly once and doesn't fight the user's own navigation
      (sending a message, switching conversations, or starting a new one all mark it as "handled").
- [x] 4.3 Add a minimal conversation switcher (e.g. a small dropdown listing recent conversations by
      their preview text) and an explicit "New chat" action that clears `conversationId`/`messages`.
      Implemented as a `DropdownMenuPrimitive`-based "History" button (matching Navbar.tsx's
      existing TeamSwitcher pattern) plus a "New chat" button, both in the Chat page header.
- [ ] 4.4 Manual check: send messages, navigate away and back (and hard-reload), confirm the
      conversation resumes; start a new chat, confirm it doesn't bleed into the old one. **Not done
      in this pass** — requires a running dev server + browser session.

## 5. Verification

- [x] 5.1 `cd backend && npm test && npm run build` — clean (528/528 tests passing).
- [x] 5.2 `cd frontend && npm run build && npm run lint` — clean (same 4 pre-existing, unrelated
      lint errors; one new violation this change introduced — `react-hooks/set-state-in-effect` on
      the auto-resume effect's async hydration call — was fixed with a scoped, commented
      eslint-disable, matching this file's existing precedent for the adjacent `exhaustive-deps`
      exception on the same effect).
