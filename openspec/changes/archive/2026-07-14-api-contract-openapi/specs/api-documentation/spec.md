## ADDED Requirements

### Requirement: OpenAPI 3.1 contract exists for the REST API

The system SHALL maintain a single OpenAPI 3.1 document that describes every implemented `/api/v1` resource operation, including path, method, request body, query parameters, and response shapes. The document MUST be valid against the OpenAPI 3.1 schema.

#### Scenario: Spec validates

- **WHEN** the OpenAPI document is validated with an OpenAPI 3.1 validator
- **THEN** validation passes with no errors

#### Scenario: All routes are documented

- **WHEN** a route registered under `/api/v1` (news-items, platform-posts, brand-voice-examples) is inspected
- **THEN** the OpenAPI document contains a matching path + method entry for it

### Requirement: Raw spec is served over HTTP

The system SHALL expose the OpenAPI document at a stable endpoint `GET /api/v1/openapi.json` returning the spec as JSON with HTTP 200.

#### Scenario: Fetch raw spec

- **WHEN** a client sends `GET /api/v1/openapi.json`
- **THEN** the response is HTTP 200 with `Content-Type: application/json` and a body whose `openapi` field starts with `3.1`

### Requirement: Interactive documentation UI is served

The system SHALL serve an interactive documentation UI (Swagger UI) at `GET /api/v1/docs` that renders the OpenAPI document.

#### Scenario: Open docs UI

- **WHEN** a client opens `GET /api/v1/docs` in a browser
- **THEN** the response is HTTP 200 and renders an interactive UI listing the documented resources and operations

### Requirement: Standard response envelopes are described as reusable schemas

The OpenAPI document SHALL define reusable component schemas for the standard success envelope (`success`, `message`, `meta`, `data`), the pagination `Meta` object (`page`, `limit`, `total`, `totalPage`), and the standard error envelope (`success`, `message`, `errorSource`), matching the shapes produced by `sendResponse` and the global error handler.

#### Scenario: List response references envelope

- **WHEN** a list operation (e.g. `GET /api/v1/news-items`) response schema is inspected
- **THEN** it references the success envelope with a `meta` object and a `data` array of the resource schema

#### Scenario: Error response references error envelope

- **WHEN** any operation's `4xx` or `5xx` response is inspected
- **THEN** it references the error envelope schema containing `success`, `message`, and `errorSource`

### Requirement: Resource schemas mirror validation and data models

The OpenAPI document SHALL define component schemas for `NewsItem`, `PlatformPost`, and `BrandVoiceExample` whose required and optional fields, types, and constraints match the corresponding Zod validators and Mongoose interfaces.

#### Scenario: Create request matches validator

- **WHEN** the request body schema for `POST /api/v1/news-items` is compared to `createNewsItemValidation`
- **THEN** required fields (`source`, `source_id`, `content_hash`, `title`, `url`) and optional fields are represented with matching types and constraints (e.g. `url` is `format: uri`, `embedding` length 1536)

### Requirement: Standard operations and error responses are documented per resource

For each resource the OpenAPI document SHALL document `POST /`, `GET /`, `GET /{id}`, `PATCH /{id}`, and `DELETE /{id}`, including the shared list query parameters (`searchTerm`, `sort`, `page`, `limit`) on list operations and the documented `404` and `500` responses.

#### Scenario: List query parameters documented

- **WHEN** a list operation is inspected
- **THEN** `searchTerm`, `sort`, `page`, and `limit` appear as optional query parameters

#### Scenario: Not-found response documented

- **WHEN** a `GET /{id}` operation is inspected
- **THEN** it declares a `404` response referencing the error envelope schema

### Requirement: Contract stays in sync with implemented routes

The OpenAPI document SHALL be updated whenever a documented route's path, method, request schema, or response schema changes, so that the contract never diverges from the running API.

#### Scenario: New route added without documentation

- **WHEN** a new `/api/v1` route is added but the OpenAPI document is not updated
- **THEN** the contract is considered incomplete and MUST be updated before the change is archived
