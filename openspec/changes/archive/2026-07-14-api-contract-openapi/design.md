## Context

The backend is an Express 5 + TypeScript app using a modular MVC layout (`backend/src/app/modules/<Feature>/`). Three resources are live under `/api/v1`: `news-items`, `platform-posts`, `brand-voice-examples`, each a standard CRUD router with Zod validation on `POST`/`PATCH`. Responses are wrapped by a shared `sendResponse` envelope (`success`, `message`, `meta`, `data`); errors flow through `globalErrorHandler` producing (`success`, `message`, `errorSource`, `stack`). List queries go through `QueryBuilder`, which supports `searchTerm`, `sort`, `page`, `limit`. There is no OpenAPI contract or docs UI today. Existing typegen sources of truth are the Zod validators and the Mongoose interfaces.

## Goals / Non-Goals

**Goals:**
- One valid OpenAPI 3.1 document covering all current `/api/v1` operations, envelopes, and resource schemas.
- Serve the raw spec (`/api/v1/openapi.json`) and interactive Swagger UI (`/api/v1/docs`) from the running backend.
- Keep schemas aligned with the Zod validators and Mongoose interfaces, and easy to update as routes evolve.
- Zero behavior change to existing endpoints.

**Non-Goals:**
- Auto-generating the spec from Zod at runtime (may be a future enhancement).
- Generating frontend TypeScript clients (spec enables it later; not in scope now).
- Adding authentication, versioning changes, or new business endpoints.
- Contract testing / request validation against the spec at runtime.

## Decisions

**1. Author the spec as a hand-written TypeScript OpenAPI object, not YAML.**
Keeping the document as a typed TS module (`backend/src/app/docs/openapi.ts`) colocated with the code lets it import shared constants, be type-checked by `tsc`, and be bundled by the existing build. Alternatives: a standalone `openapi.yaml` (drifts from code, no type-checking) or runtime generation from Zod via `zod-to-openapi` (adds coupling and a heavier dependency for a hackathon). Chosen for lowest friction and strongest sync guarantees via review.

**2. Serve docs with `swagger-ui-express` + serve the raw JSON from an Express handler.**
`swagger-ui-express` is the lightest, most common way to mount Swagger UI in Express and needs only the JS object. `GET /api/v1/openapi.json` returns the same object via `res.json`. Alternative: `@scalar/express-api-reference` (nicer UI, newer/heavier). Swagger UI chosen for familiarity and minimal setup. Both docs routes mount inside the `/api/v1` router so they share the base path.

**3. Model the response envelope with composition (`allOf`).**
Define base `SuccessEnvelope`, `Meta`, and `ErrorEnvelope` components once; each operation response uses `allOf` to combine the envelope with a resource-specific `data` schema (object for single, array for list). This mirrors `sendResponse`/`globalErrorHandler` exactly and avoids duplicating envelope fields per operation.

**4. Derive resource component schemas from the Zod validators + interfaces, kept in sync by review.**
`NewsItem`, `PlatformPost`, `BrandVoiceExample` schemas encode the same required/optional fields, types, and constraints (e.g. `url` → `format: uri`, `embedding` → array length 1536). A short checklist in `tasks.md` ties each schema back to its validator so reviewers can verify parity.

## Risks / Trade-offs

- **Hand-written spec drifts from code as routes change** → Mitigate with a spec requirement mandating updates on route change, a review checklist mapping schemas to validators, and colocating the spec in-repo so it shows up in the same PRs.
- **New dependency (`swagger-ui-express`) adds surface area** → Small, widely used, dev/runtime-light; mount only under `/api/v1/docs` so it is easy to remove.
- **Docs endpoints publicly expose the API shape** → Acceptable for a hackathon demo; can be gated later if needed. `stack` from the error envelope is documented as present but should not be relied on in production.
- **Manual schema authoring is verbose** → Accepted trade-off vs. runtime generation; keeps dependencies minimal and the contract explicit.

## Migration Plan

Additive only. Add the dependency and spec module, mount the two docs routes, verify `/api/v1/openapi.json` validates and `/api/v1/docs` renders. Rollback = remove the two routes and the module; no data or existing-endpoint impact.

## Open Questions

- Should the raw spec also be offered as YAML? (Default: JSON only for now.)
- Do we want the docs routes gated behind an env flag in production? (Default: always on for the demo.)
