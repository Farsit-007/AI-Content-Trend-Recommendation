## ADDED Requirements

### Requirement: A team's past conversations can be listed
`GET /chat/conversations` (team-scoped) SHALL return every distinct `conversation_id` recorded for
that team, most-recently-active first, each with a preview of its last message, its message count,
and its last-activity timestamp.

#### Scenario: Team with multiple past conversations
- **WHEN** a team member requests `GET /chat/conversations?team_id=<id>` for a team with 3 past
  conversations
- **THEN** the response lists all 3, ordered by most recent activity first

#### Scenario: Team with no chat history yet
- **WHEN** a team member requests the list for a team that has never used chat
- **THEN** the response is an empty list, not an error

### Requirement: One conversation's full message history can be retrieved
`GET /chat/conversations/:conversationId` (team-scoped) SHALL return every message in that
conversation, in chronological order, for the requesting user's team.

#### Scenario: Retrieving an existing conversation
- **WHEN** a team member requests a `conversationId` that belongs to their team
- **THEN** every user/assistant turn in that conversation is returned in the order they occurred

#### Scenario: A conversation belonging to a different team
- **WHEN** a team member requests a `conversationId` that was recorded under a different team
- **THEN** the response does not leak that other team's messages (empty result or 404 — not another
  team's data)

### Requirement: Chat resumes the most recent conversation on page load
The Chat page SHALL load and display the team's most recent conversation on mount instead of always
starting from an empty state, and SHALL let the user explicitly start a new conversation.

#### Scenario: Returning to the Chat page after navigating away
- **WHEN** a user who previously had an active conversation returns to `/dashboard/chat` (via
  navigation or a full page reload)
- **THEN** their most recent conversation's messages are shown, not an empty chat

#### Scenario: Starting a new conversation explicitly
- **WHEN** a user chooses to start a new conversation
- **THEN** a fresh `conversation_id` is used for subsequent messages and the visible history clears
