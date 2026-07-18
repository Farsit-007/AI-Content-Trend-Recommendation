## ADDED Requirements

### Requirement: A successful interactive content generation is durably persisted without requiring an explicit save
When `POST /content/generate` succeeds for an interactive (non-auto) request, the frontend SHALL
persist the result as a `GeneratedContent` draft immediately, without requiring the user to remain
on the Generate page or click an explicit save action first.

#### Scenario: User navigates away before manually saving
- **WHEN** a user submits a generate request and navigates to another page before the response
  arrives
- **THEN** the generated content is still saved as a draft, retrievable later from the Drafts page

#### Scenario: User stays on the page
- **WHEN** a user submits a generate request and remains on the Generate page until it completes
- **THEN** a success toast confirms completion and the result is both shown in the editor and
  already saved as a draft

### Requirement: An app-wide indicator shows in-flight and just-completed background tasks
The application SHALL provide a persistent UI element, visible from any page, indicating when
ingestion, content generation, or a chat request is in flight or has just completed.

#### Scenario: Task started from one page, user navigates to another
- **WHEN** a user triggers ingestion (or content generation, or sends a chat message) and then
  navigates to a different page before it finishes
- **THEN** the active-tasks indicator on the new page still reflects that the task is running, and
  updates to reflect completion once it finishes

#### Scenario: No tasks running
- **WHEN** no ingestion, generation, or chat request is in flight
- **THEN** the indicator shows no active tasks
