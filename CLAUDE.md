# Collectify Backend — Rules for Claude Code

## Context
Case study for the Papcorns Backend Engineer role. "Collectify" is a fictional mobile app; this repo is the REST API only (no client).
The author must explain every line in a follow-up technical interview, so:
- Prefer simple, explicit code over clever abstractions.
- Do not add features that are not in `ROADMAP.md`.
- Work one phase at a time; stop and summarize after each phase.

## Stack
- Node.js 22 (Node 20 runtime is decommissioned on Cloud Functions on 2026-10-30), TypeScript (`strict: true`), no `any`
- Firebase Cloud Functions **v2** (`onRequest`), one function hosting one Express **5** app, region `us-central1`
- Firestore + Firebase Auth via `firebase-admin`
- Zod for validation, Jest + Supertest against the Firebase Emulator Suite
- ESLint + Prettier

Express 5 forwards rejected promises to the error handler — do not add an `asyncHandler` wrapper.

## Folder structure
```
functions/src/
├── index.ts          # export const api = onRequest({ region }, app)
├── app.ts            # express app: middleware order, routers, errorHandler last
├── config/           # admin SDK init, constants (limits, SERVICE_ID)
├── middleware/       # authenticate, validate, requestContext, rateLimit, errorHandler
├── routes/           # health, collections, items (items router uses mergeParams)
├── controllers/      # HTTP only
├── services/         # business rules + transactions
├── repositories/     # the ONLY layer that knows Firestore paths
├── schemas/          # zod schemas (+ inferred types)
├── mappers/          # Firestore doc -> DTO, Timestamp -> ISO 8601
└── errors/           # AppError and subclasses
functions/test/       # integration tests (emulator)
```

### Layer rules
- **routes**: wiring only (path + middleware + controller).
- **controllers**: read validated input and `req.user.uid`, call one service method, map to DTO, set status. Never import Firestore.
- **services**: business rules and transactions. Never touch `req`/`res`. Throw `AppError` subclasses.
- **repositories**: all Firestore reads/writes and path building.
- **errorHandler**: the only place that turns errors into HTTP responses. Unknown errors -> 500 with a generic message, full error logged.

## Data model (Firestore)
```
users/{uid}
  collectionCount: number

users/{uid}/collectionNames/{sha256(nameKey)}
  collectionId: string

users/{uid}/collections/{collectionId}
  userId, name, nameKey, description, createdAt, updatedAt

users/{uid}/collections/{collectionId}/items/{itemId}
  collectionId, userId, title, content, url, imageUrl, tags, priority, createdAt, updatedAt
```
- Ownership is structural: every query is built from the uid path, so cross-user reads are impossible by construction. `userId` is still stored because the case's model requires it.
- `nameKey = name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()`.
- Lock doc ID is `sha256(nameKey)` because raw names may contain `/` or exceed doc-ID limits.
- Writes use `FieldValue.serverTimestamp()`; responses return ISO 8601 strings.

## Business rules (non-negotiable)
1. **Max 20 collections per user.** Check and increment `collectionCount` inside the same transaction as the create. Never `count()` then `add()`.
2. **Unique name per user** (case-insensitive, trimmed). Lock doc read + write inside the same transaction -> `409 DUPLICATE_COLLECTION_NAME`. Rename = delete old lock + create new lock in one transaction.
3. **Delete collection** -> delete all items (`firestore.recursiveDelete`), delete the name lock, decrement `collectionCount`.
4. **Ownership**: uid comes only from the verified ID token. Another user's resource -> `404` (never 403, to avoid leaking existence).
5. **Item validation**: `title` required, trimmed, 3–100 chars; `priority` in `low|medium|high`, default `medium`; `content` string; `url`, `imageUrl` optional valid http(s) URLs; `tags` array of trimmed non-empty strings, max 20, deduplicated.
6. **camelCase everywhere**, including `createdAt`/`updatedAt` on items (the case's `created_at` is intentionally overridden — documented in README).
7. **Unknown body fields are rejected** (`z.object(...).strict()`).
8. **Health**: `GET /health`, no auth, returns exactly:
   `{ "status": "ok", "serviceId": "ppc-collectify-svc-a1b2c3d4e5f6-us-central1-prod-v2.4.1-rev8a3f" }`

## API conventions
- Paths exactly as in the case (`/collections`, `/collections/:collectionId/items/...`), no version prefix.
- Success: single resource -> `{ "data": { ... } }`; list -> `{ "data": [ ... ], "pagination": { "nextCursor": string | null } }`.
- Error: `{ "error": { "code": "SCREAMING_SNAKE", "message": "human readable", "details"?: [...] } }`.
- Status codes: `200` read/update, `201` create (+ `Location` header), `204` delete, `400` validation, `401` auth, `404` not found, `409` duplicate name / limit reached, `429` rate limit, `500` unexpected.
- `PUT` accepts a partial body with at least one updatable field (documented trade-off vs PATCH).
- Lists: cursor pagination with `limit` (default 20, max 100) and `cursor`; ordered by `createdAt desc`.

## Coding rules
- Small, named functions; comments explain *why*, not *what*.
- No floating promises; no `console.log` (use `firebase-functions/logger`).
- Every business rule above has at least one integration test.
- Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), small and per phase.
- **Dependencies**: never pick a version from memory. Run `npm view <pkg> version` (and `peerDependencies`) first, then use the newest major that is compatible with the rest of the toolchain. TypeScript stays on 5.x: ts-jest requires `<7` and typescript-eslint requires `<6.1`.

## Commands
- `npm run build` — tsc
- `npm run lint`
- `npm test` — `firebase emulators:exec --only auth,firestore "jest --runInBand"`
- `npm run serve` — build + emulators

## Workflow per phase
1. Read the phase in `ROADMAP.md`.
2. Implement only that phase.
3. Run `npm run lint && npm test`.
4. Summarize changed files and any decision made, then stop.
