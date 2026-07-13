## 1. Setup

- [x] 1.1 Add `swagger-ui-express` (and `@types/swagger-ui-express`) to `backend/package.json` and install
- [x] 1.2 Create `backend/src/app/docs/` directory for the OpenAPI module

## 2. Shared component schemas

- [x] 2.1 Define `Meta` schema (`page`, `limit`, `total`, `totalPage`) matching `sendResponse` `TMeta`
- [x] 2.2 Define `SuccessEnvelope` base schema (`success`, `message`, optional `meta`, `data`)
- [x] 2.3 Define `ErrorEnvelope` schema (`success`, `message`, `errorSource[] {path, message}`, optional `stack`) matching `globalErrorHandler`
- [x] 2.4 Define reusable `ListQueryParameters` (`searchTerm`, `sort`, `page`, `limit`) for list operations

## 3. Resource schemas

- [x] 3.1 Define `NewsItem` schema aligned with `newsItem.interface.ts` + `NewsItemValidation` (required `source`, `source_id`, `content_hash`, `title`, `url` `format: uri`; `embedding` array length 1536; `engagement` object)
- [x] 3.2 Define `PlatformPost` schema aligned with `platformPost.interface.ts` + validators (`platform`, `post_id`, `metrics` object)
- [x] 3.3 Define `BrandVoiceExample` schema aligned with `brandVoiceExample.interface.ts` + validators (`platform`, `content`, optional `category`, `engagement_hint`, `added_by`)

## 4. Path definitions

- [x] 4.1 Document `news-items` operations: `POST /`, `GET /` (with list query params + paginated envelope), `GET /{id}`, `PATCH /{id}`, `DELETE /{id}` with `404`/`500` error responses
- [x] 4.2 Document `platform-posts` operations (same CRUD + error set)
- [x] 4.3 Document `brand-voice-examples` operations (same CRUD + error set)
- [x] 4.4 Assemble the full OpenAPI 3.1 document (`openapi: 3.1.0`, `info`, `servers: /api/v1`, `components`, `paths`) in `backend/src/app/docs/openapi.ts`

## 5. Serving

- [x] 5.1 Add `GET /openapi.json` handler returning the spec object as JSON inside the `/api/v1` router (or `app.ts`)
- [x] 5.2 Mount Swagger UI at `/api/v1/docs` via `swagger-ui-express`
- [x] 5.3 Ensure docs routes are registered before `notFound` middleware in `app.ts`

## 6. Verification

- [x] 6.1 Run `npm run typecheck` — spec module compiles with no type errors
- [x] 6.2 Validate the served `/api/v1/openapi.json` against an OpenAPI 3.1 validator — passes
- [x] 6.3 Manually open `/api/v1/docs` and confirm all three resources and their operations render
- [x] 6.4 Cross-check each resource schema against its Zod validator (required/optional fields, types, constraints) for parity
