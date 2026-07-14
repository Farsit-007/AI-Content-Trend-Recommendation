## ADDED Requirements

### Requirement: Team-scoped chat endpoint
The system SHALL expose `POST /api/v1/chat`, requiring authentication, that accepts a `team_id`, a free-text `message`, and an optional `conversation_id`, and returns an assistant reply grounded in that team's data.

#### Scenario: Authenticated team member asks a question
- **WHEN** a user with access to `team_id` sends a `message` with no `conversation_id`
- **THEN** the system generates a new `conversation_id`, retrieves relevant context for the question, calls the LLM, persists both the user's message and the assistant's reply, and returns the reply plus the `conversation_id`

#### Scenario: User without team access is rejected
- **WHEN** a user whose `team_ids` does not include the requested `team_id` (and who is not `admin`/`super_admin`) calls the endpoint
- **THEN** the system responds with a 403 Forbidden error and does not perform retrieval, persistence, or an LLM call

#### Scenario: Unauthenticated request is rejected
- **WHEN** the request has no valid auth token
- **THEN** the system responds with a 401 error before reaching the chat handler

### Requirement: News-aware retrieval
The system SHALL retrieve relevant `NewsItem` context when the question concerns trends, news, or "what to post/create", ranking candidates by a combination of `trend_score`/`opportunity_score` and embedding similarity to the question.

#### Scenario: Trend question surfaces top news
- **WHEN** the message contains trend/news-related language (e.g., mentions "trending", "news", a known category, or a platform-agnostic "what should I post" phrasing)
- **THEN** the system embeds the question, selects a candidate pool of top-scoring `NewsItem` documents, ranks them by similarity to the question embedding, and includes the top results as context passed to the LLM

### Requirement: Performance-aware retrieval
The system SHALL retrieve the team's own `PlatformPost` performance data when the question concerns a specific platform or performance/engagement metrics.

#### Scenario: Platform performance question surfaces the team's own posts
- **WHEN** the message references a platform (e.g., Facebook, YouTube, LinkedIn, or Bengali equivalents) or performance terms (reach, engagement, views)
- **THEN** the system retrieves that team's `PlatformPost` documents, ranks them by engagement and similarity to the question, and includes the top results as context passed to the LLM

### Requirement: Fallback retrieval on ambiguous questions
The system SHALL retrieve both news and performance context when a question matches neither news nor performance intent, rather than returning an empty-context answer.

#### Scenario: Off-keyword question still gets grounded context
- **WHEN** the message does not match any recognized news or performance keywords
- **THEN** the system runs both retrieval paths and includes whatever context each returns, even if one or both are empty

### Requirement: Multi-turn conversation continuity
The system SHALL persist chat turns per team and conversation, and SHALL include recent prior turns from the same `conversation_id` as conversation context for follow-up questions.

#### Scenario: Follow-up question in the same conversation
- **WHEN** a user sends a message with a `conversation_id` from a prior response
- **THEN** the system loads the recent messages for that `team_id` + `conversation_id`, includes them as prior turns in the prompt, and appends the new user message and assistant reply to the same conversation

#### Scenario: Unknown or foreign conversation_id
- **WHEN** a user supplies a `conversation_id` that does not belong to their `team_id`
- **THEN** the system treats it as a new conversation rather than exposing another team's history

### Requirement: LLM failure handling
The system SHALL return a client-facing error, without persisting a partial assistant turn, when the LLM call fails.

#### Scenario: OpenRouter call fails
- **WHEN** `chatCompletion` throws or times out
- **THEN** the system responds with a 502 error and does not write an assistant `ChatMessage` document (the user's message may still be persisted)
