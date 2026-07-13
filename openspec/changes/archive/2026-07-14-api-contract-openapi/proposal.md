## Why

The backend exposes REST endpoints (`/api/v1/news-items`, `/api/v1/platform-posts`, `/api/v1/brand-voice-examples`) but has no machine-readable contract. Frontend and future integrators must reverse-engineer request/response shapes from Zod validators and the `sendResponse` envelope, which is error-prone and slows parallel frontend/backend work during the hackathon. A single OpenAPI document gives one source of truth, interactive docs, and a base for client typegen.

## What Changes

- Add an **OpenAPI 3.1 specification** describing all existing `/api/v1` resources, their CRUD operations, query parameters (`searchTerm`, `sort`, `page`, `limit`), the standard success envelope (`success`, `message`, `meta`, `data`), and the standard error envelope (`success`, `message`, `errorSource`, `stack`).
- Serve **interactive API documentation** (Swagger UI) and the raw spec (JSON/YAML) from the running backend at a stable route (e.g. `/api/v1/docs` and `/api/v1/openapi.json`).
- Establish reusable **component schemas** for each resource (`NewsItem`, `PlatformPost`, `BrandVoiceExample`), the pagination `Meta`, and the error object, kept aligned with the existing Zod validation and Mongoose interfaces.
- Document the health/root route and the standard `404` (notFound) and `500` (globalErrorHandler) responses.

No runtime behavior of existing endpoints changes — this is additive and non-breaking.

## Capabilities

### New Capabilities
- `api-documentation`: A published OpenAPI 3.1 contract for the backend REST API plus a served interactive docs UI and raw spec endpoints, kept in sync with the implemented routes, validators, and response envelopes.

### Modified Capabilities
<!-- None — existing endpoint behavior is unchanged; this only documents it. -->

## Impact

- **Code:** New OpenAPI definition source (component schemas + paths), a docs-serving setup in `backend/src/app.ts` (new middleware/route), and new dev dependencies (e.g. an OpenAPI/Swagger UI serving library).
- **APIs:** New non-versioned-behavior routes `GET /api/v1/docs` and `GET /api/v1/openapi.json`; no change to existing resource endpoints.
- **Dependencies:** Add a Swagger UI / OpenAPI serving package to `backend/package.json`.
- **Consumers:** Frontend and integrators gain a stable contract; enables future client type generation from the spec.
