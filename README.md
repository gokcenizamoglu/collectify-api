# Collectify Backend

[![CI](https://github.com/gokcenizamoglu/collectify-api/actions/workflows/ci.yml/badge.svg)](https://github.com/gokcenizamoglu/collectify-api/actions/workflows/ci.yml)

REST API for "Collectify", a fictional mobile app, built for the Papcorns Backend Engineer case study. It is a single Firebase Cloud Function (v2 `onRequest`, region `us-central1`) hosting one Express 5 app, backed by Firestore and Firebase Auth via the Admin SDK. There is no client in this repo — it is the API only.

**Live:** `https://us-central1-collectify-case.cloudfunctions.net/api` — try it with `curl https://us-central1-collectify-case.cloudfunctions.net/api/health` (no auth). All other endpoints require a Firebase ID token.

## Quick start

Requirements:

- Node.js 22 (see [`.nvmrc`](.nvmrc); Node 20 runtime is decommissioned on Cloud Functions on 2026-10-30)
- JDK 21+ (the Firestore/Auth emulators are Java apps; `firebase-tools` 15 requires it)

```bash
cd functions
npm ci            # install dependencies
npm run serve     # build + start the emulators (auth 9099, firestore 8080, functions 5001, UI on)
```

In a second terminal, mint a test ID token against the running Auth emulator:

```bash
npm run token     # prints a fresh ID token to stdout
```

Run the integration test suite (spins the emulators up and down):

```bash
npm test
```

Other scripts: `npm run build` (tsc), `npm run lint` (eslint), `npm run format` (prettier).

The function base URL (`$BASE_URL` in the examples below) is the live URL above, or `http://127.0.0.1:5001/<projectId>/us-central1/api` against the emulators.

## API reference

All paths are relative to the function base URL. Every endpoint except `GET /health` requires `Authorization: Bearer <idToken>`.

**Common request headers**

| Header | Applies to | Meaning |
|--------|-----------|---------|
| `Authorization: Bearer <idToken>` | everything except `/health` | Firebase ID token; `req.user.uid` is taken only from the verified token |
| `Idempotency-Key: <8-128 [A-Za-z0-9-_]>` | `POST /collections`, `POST .../items` | Safe retry: the same key replays the first result instead of creating a duplicate |
| `X-Request-Id: <1-128 [A-Za-z0-9-_]>` | any | Correlation id; reused if valid, otherwise generated. Always echoed back in the response |

**Response envelopes**

- Single resource: `{ "data": { ... } }`
- List: `{ "data": [ ... ], "pagination": { "nextCursor": string | null } }`
- Error: `{ "error": { "code": "SCREAMING_SNAKE", "message": "human readable", "details"?: [{ "path", "message" }], "requestId"? } }` (`requestId` is included only on `500`)

**Endpoints**

| Method | Path | Success | Error codes |
|--------|------|---------|-------------|
| GET | `/health` | 200 | — |
| POST | `/collections` | 201 + `Location` | 400 `VALIDATION_ERROR` / `INVALID_IDEMPOTENCY_KEY`, 401, 409 `DUPLICATE_COLLECTION_NAME` / `COLLECTION_LIMIT_REACHED`, 422 `IDEMPOTENCY_KEY_MISMATCH`, 429 `RATE_LIMITED` |
| GET | `/collections` | 200 (list) | 400 `VALIDATION_ERROR` / `INVALID_CURSOR`, 401, 429 |
| GET | `/collections/:collectionId` | 200 (collection + embedded first page of items + `itemsNextCursor`) | 401, 404 `COLLECTION_NOT_FOUND`, 429 |
| PUT | `/collections/:collectionId` | 200 | 400 `VALIDATION_ERROR`, 401, 404 `COLLECTION_NOT_FOUND`, 409 `DUPLICATE_COLLECTION_NAME`, 429 |
| DELETE | `/collections/:collectionId` | 204 | 401, 404 `COLLECTION_NOT_FOUND`, 429 |
| POST | `/collections/:collectionId/items` | 201 + `Location` | 400 `VALIDATION_ERROR` / `INVALID_IDEMPOTENCY_KEY`, 401, 404 `COLLECTION_NOT_FOUND`, 422 `IDEMPOTENCY_KEY_MISMATCH`, 429 |
| GET | `/collections/:collectionId/items` | 200 (list; `priority` & `tag` filters) | 400 `VALIDATION_ERROR` / `INVALID_CURSOR`, 401, 404 `COLLECTION_NOT_FOUND`, 429 |
| GET | `/collections/:collectionId/items/:itemId` | 200 | 401, 404 `ITEM_NOT_FOUND`, 429 |
| PUT | `/collections/:collectionId/items/:itemId` | 200 | 400 `VALIDATION_ERROR`, 401, 404 `ITEM_NOT_FOUND`, 429 |
| DELETE | `/collections/:collectionId/items/:itemId` | 204 | 401, 404 `ITEM_NOT_FOUND`, 429 |

Cross-cutting errors: unknown routes → 404 `ROUTE_NOT_FOUND`; malformed JSON body → 400 `INVALID_JSON`; body over 100 KB → 413 `PAYLOAD_TOO_LARGE`; missing/invalid auth → 401 `MISSING_TOKEN` / `INVALID_AUTH_HEADER` / `TOKEN_EXPIRED` / `INVALID_TOKEN` (all with a `WWW-Authenticate: Bearer` challenge); anything unexpected → 500 `INTERNAL_ERROR`.

Lists use cursor pagination: `limit` (default 20, max 100) and an opaque `cursor`, ordered by `createdAt desc`.

**curl examples**

```bash
# Health (no auth)
curl "$BASE_URL/health"

# Create a collection (idempotent)
curl -X POST "$BASE_URL/collections" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"name":"Recipes","description":"things to cook"}'

# List collections (first page of 10)
curl "$BASE_URL/collections?limit=10" -H "Authorization: Bearer $TOKEN"

# Get a collection with its first page of items embedded
curl "$BASE_URL/collections/$COLLECTION_ID" -H "Authorization: Bearer $TOKEN"

# Update (partial)
curl -X PUT "$BASE_URL/collections/$COLLECTION_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"description":"updated"}'

# Delete a collection (cascades to its items)
curl -X DELETE "$BASE_URL/collections/$COLLECTION_ID" -H "Authorization: Bearer $TOKEN"

# Create an item
curl -X POST "$BASE_URL/collections/$COLLECTION_ID/items" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Pancakes","priority":"high","tags":["breakfast"],"url":"https://example.com"}'

# List items filtered by priority and tag
curl "$BASE_URL/collections/$COLLECTION_ID/items?priority=high&tag=breakfast" \
  -H "Authorization: Bearer $TOKEN"

# Get / update / delete an item
curl "$BASE_URL/collections/$COLLECTION_ID/items/$ITEM_ID" -H "Authorization: Bearer $TOKEN"
curl -X PUT "$BASE_URL/collections/$COLLECTION_ID/items/$ITEM_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"imageUrl":null}'
curl -X DELETE "$BASE_URL/collections/$COLLECTION_ID/items/$ITEM_ID" -H "Authorization: Bearer $TOKEN"
```

## Data model

```
users/{uid}
  collectionCount: number

users/{uid}/collectionNames/{sha256(nameKey)}      # uniqueness lock
  collectionId: string

users/{uid}/collections/{collectionId}
  userId, name, nameKey, description, createdAt, updatedAt

users/{uid}/collections/{collectionId}/items/{itemId}
  collectionId, userId, title, content, url, imageUrl, tags, priority, createdAt, updatedAt

users/{uid}/idempotencyKeys/{sha256(scope + key)}  # replay record, TTL on expiresAt
  requestHash, resourceId, createdAt, expiresAt
```

Items are a **subcollection** of their collection: every query is built from the `uid` path, so cross-user reads are impossible by construction and a cascade delete has a clear subtree to sweep. `userId` is still stored on each doc because the case's model requires it.

## Design decisions

Each is "decision — why — alternative".

- **camelCase `createdAt` / `updatedAt`.** The API is camelCase end to end, so item timestamps are `createdAt`/`updatedAt`, intentionally overriding the case's `created_at`. Consistency across the whole surface beats matching one field name. Alternative: snake_case just for items — rejected as inconsistent.
- **404, never 403, for another user's resource.** Ownership is structural: a resource lives under `users/{uid}/...`, so another user's id simply doesn't exist on your path. Returning 403 would confirm the resource exists and leak information. Alternative: 403 — rejected (existence leak).
- **Uniqueness via a lock document inside a transaction.** A name lock at `collectionNames/{sha256(nameKey)}` is read and written in the same transaction as the collection, so two concurrent creates can't both win. `nameKey` is `name` NFKC-normalized, trimmed, whitespace-collapsed, lowercased; the id is its sha256 because raw names may contain `/` or exceed doc-id limits. The 20-per-user limit is checked against a `collectionCount` read and incremented in that same transaction (never `count()` then `add()`); exceeding it returns 409 `COLLECTION_LIMIT_REACHED`, a duplicate name returns 409 `DUPLICATE_COLLECTION_NAME`. Alternative: a query to check uniqueness — rejected (racy, and a query can't be made atomic with the write).
- **`PUT` is a partial update.** It accepts a partial body with at least one updatable field, which is technically PATCH semantics. Kept as `PUT` for fidelity to the case's endpoint list; documented as a deliberate trade-off.
- **Cascade delete: transaction first, then `recursiveDelete`.** The collection doc, its lock, and the counter are removed in one transaction; the items subcollection is then swept with `recursiveDelete` (items don't fit the 500-write transaction cap). This order means a crash leaves only unreachable orphan items under an already-deleted collection — nothing visibly inconsistent; the reverse order could leave "collection exists but half its items are gone". A `recursiveDelete` failure is logged but still returns 204. Alternative: an `onDocumentDeleted` Firestore trigger to clean up asynchronously — viable, but adds a second deployable and eventual-consistency window; kept inline for simplicity.
- **Cursor pagination.** Offset pagination costs more as the offset grows (the database still scans skipped rows) and is unstable under inserts; a cursor (`base64url([createdAtMillis, id])`) seeks directly with `startAfter` and never re-reads the cursor document. Results are ordered `createdAt desc` with `documentId desc` as a tie-break so docs sharing a millisecond paginate without repeats or gaps. `GET /collections/:id` embeds the first page of items (plus `itemsNextCursor`) to save the client a round-trip; the rest are fetched via the items list endpoint.
- **Idempotency-Key.** On `POST /collections` and `POST .../items`, the replay record is written in the same transaction as the resource, so "created but not recorded" can never happen. A repeat with the same key replays the stored result (201 + `Idempotent-Replayed: true`) and is checked before the duplicate/limit rules so a retry doesn't collide with its own lock; the same key with a different body is 422 `IDEMPOTENCY_KEY_MISMATCH`; a replay whose resource was since deleted is 404. Records carry a 24h `expiresAt` cleaned up by a Firestore TTL policy.
- **Strict validation (Zod).** All bodies use `z.strictObject`, so unknown fields are rejected (400). URLs are parsed with the `URL` class and accepted only for `http:`/`https:` — this rejects not just `ftp://` but `javascript:`/`data:` URIs, which matters because a mobile client may open a stored URL in a WebView. Tags are trimmed, length-bounded, lowercased, and de-duplicated so filtering is case-insensitive.
- **Auth.** The uid comes only from a verified ID token. `verifyIdToken` is called **without** `checkRevoked`: that would add a lookup on every request; we accept that a token revoked mid-session stays valid until it naturally expires (≤1h) in exchange for lower latency. `auth/id-token-expired` maps to 401 `TOKEN_EXPIRED` (distinct from `INVALID_TOKEN`) so clients can refresh; non-`auth/*` failures propagate as 500 rather than masquerading as 401. Every 401 carries an RFC 6750 `WWW-Authenticate: Bearer` challenge (`error="invalid_token"` once a token was supplied but rejected).
- **Firestore rules are deny-all.** Clients never touch Firestore directly; the API (Admin SDK) is the only gateway and the Admin SDK bypasses rules. Alternative: client-side rules — rejected, as it would duplicate and weaken the single-gateway model.
- **Observability.** Each request gets an `X-Request-Id` (reused if the client sent a valid one) echoed in the response and written to exactly one structured access-log line (method, route **template** with ids replaced by `:param`, status, durationMs, uid). The route template keeps logs low-cardinality for per-route metrics. 500s log and return the `requestId` so a user can quote it to support. Tokens, bodies, and headers are never logged.
- **Rate limiting.** Per-user (keyed by uid, not IP): mobile clients share carrier NAT/CGNAT, so an IP limit would punish unrelated users together. 100 requests/minute; exceeding it returns 429 `RATE_LIMITED` with `Retry-After`. `/health` is exempt. See Known limitations for the in-memory caveat.
- **No CORS middleware.** The client is a native mobile app; CORS is a browser mechanism and does not apply to native HTTP requests. Adding it would be dead configuration.

## Known limitations

- **Rate limit is per-instance.** The limiter uses an in-memory store, so each Cloud Functions instance has its own counter; with N instances the effective limit is ~N × limit. It stops a single user from hammering one instance, not a distributed flood. `maxInstances: 10` caps N (a cost/abuse ceiling). A real global limit needs a shared store (Redis/Firestore) or an upstream gateway.
- **Unauthenticated requests aren't rate limited.** The limiter runs after `authenticate`, so requests without a valid token never reach it; `maxInstances` is the backstop against an unauthenticated flood.
- **Composite indexes aren't enforced by the emulator.** The `priority` / `tag` / `priority+tag` item queries need the composite indexes in [`firestore.indexes.json`](firestore.indexes.json) in production; the emulator runs the filter tests without them, so a missing index only surfaces on deploy.
- **Remaining `npm audit` advisories.** A few moderate advisories remain, all in the `firebase-tools` dev dependency tree (or a transitive `gaxios`/`uuid` under `firebase-admin`'s unused storage path). They are fixable only by downgrading the dev CLI, so `npm audit fix --force` was **not** used; none affect the deployed function.

## Testing

Integration tests run with Supertest against the Firebase Emulator Suite (`npm test` = `firebase emulators:exec --only auth,firestore "jest --runInBand"`). Every non-negotiable business rule maps to at least one test — see [docs/TEST_COVERAGE.md](docs/TEST_COVERAGE.md).

Two test-tooling notes:

- **Babel transform for `jose`.** `firebase-admin` pulls in `jwks-rsa`, which `require()`s the ESM-only `jose@6`; Jest's module runtime can't `require()` an ES module on Node 22. A test-only Babel transform ([`babel.config.js`](functions/babel.config.js) + a `transformIgnorePatterns` exception in [`jest.config.js`](functions/jest.config.js)) downlevels just that package to CommonJS. Production runs on real Node, which loads the ESM `jose` natively.
- **Scoped retry on one concurrency test.** The same-name parallel-create test uses `jest.retryTimes(2)` ([`test/collectionsParallel.test.ts`](functions/test/collectionsParallel.test.ts)). The Firestore emulator uses pessimistic locking and can exhaust a transaction's retry budget under heavy concurrent test load (surfacing as `ABORTED`); production practically never hits this. The retry is on the test only — the app code is unchanged, because mapping `ABORTED` to 409 would lie to the client ("busy" is not "name taken").

## Future work

- **Global rate limiting** with a shared store (Redis or a Firestore counter), replacing the per-instance in-memory store.
- **Asynchronous cascade delete** via an `onDocumentDeleted` trigger, so deleting a collection returns immediately and item cleanup runs in the background.
- **Optimistic concurrency** with `ETag` / `If-Match` on updates → 412 on a stale write.
- **OpenAPI spec** generated from the Zod schemas, for typed clients and contract tests.
- **CD:** on merge to `main`, authenticate with Workload Identity Federation (no long-lived service-account key) and run `firebase deploy --only functions,firestore:rules,firestore:indexes`. Not done now because deploy requires the Blaze plan and granting the case repo cloud access adds a low-value security surface; a reviewer can run CI with no credentials but could not run CD.

## AI-assisted development

This project was built with Claude Code. [`CLAUDE.md`](CLAUDE.md) pins the architecture, business rules, and coding conventions so the assistant stays within scope, and the work was split into phases. Each phase was reviewed before being committed, and its tests were run against the emulator. Two review findings — an id leak in the access-log route template and a 413 being returned as a 500 — were each first proven with a test and then fixed.
