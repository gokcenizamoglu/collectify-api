# Test Coverage

Every non-negotiable business rule in `CLAUDE.md` is guarded by at least one
integration test (run against the Firebase Emulator Suite). This table maps each
rule to the test(s) that protect it.

## Business rules

| # | Rule | Test file | Test |
|---|------|-----------|------|
| 1 | Max 20 collections per user; counted/incremented inside the create transaction (never `count()` then `add()`) | `test/collections.test.ts` | `21st collection -> 409 COLLECTION_LIMIT_REACHED` |
| 1 | Counter stays correct across delete | `test/collectionsDelete.test.ts` | `counter: 20 created, delete 1, create 1 ok, next -> 409` |
| 2 | Unique name per user, case-insensitive + trimmed (`409 DUPLICATE_COLLECTION_NAME`) | `test/collections.test.ts` | `"Recipes" then " recipes " -> 409 DUPLICATE_COLLECTION_NAME` |
| 2 | Uniqueness holds under concurrency | `test/collectionsParallel.test.ts` | `two parallel POSTs with the same name -> exactly one 201, one 409` |
| 2 | Rename moves the lock (old name reusable; same-key rename keeps lock) | `test/collections.test.ts` | `"Recipes" -> "RECIPES" succeeds`, `renaming onto another collection's name -> 409`, `after a rename the old name can be reused` |
| 3 | Delete collection → delete all items (`recursiveDelete`) + delete lock + decrement counter | `test/collectionsDelete.test.ts` | `deletes a collection with items -> 204; GET 404; items subcollection empty`, `550 items (beyond the 500 transaction cap)` |
| 4 | Ownership: another user's resource → `404` (never `403`) | `test/collections.test.ts`, `test/items.test.ts`, `test/collectionsDelete.test.ts` | `another user's collection -> 404 on GET and PUT`, `user B cannot GET/PUT/DELETE user A's item`, `user B cannot delete user A's collection -> 404` |
| 5 | Item validation: title 3–100, priority enum + default `medium`, http(s) url/imageUrl, tags normalized | `test/items.test.ts` | `validation: title 2/101, priority 'urgent', url 'ftp://', unknown field -> 400`, `priority defaults to medium`, `tags [...] -> ["travel", "food"]` |
| 6 | camelCase everywhere, incl. `createdAt`/`updatedAt` on items | `test/collections.test.ts`, `test/items.test.ts` | DTO-shape assertions (`createdAt`/`updatedAt` present as camelCase ISO strings) |
| 7 | Unknown body fields rejected (`z.strictObject`) | `test/collections.test.ts`, `test/items.test.ts` | `rejects an unknown body field -> 400` (both create flows) |
| 8 | `GET /health` returns the exact payload, no auth | `test/app.test.ts` | `GET /health -> 200 with the exact payload` |

## Cross-cutting behavior (API conventions & differentiators)

| Area | Test file | Test(s) |
|------|-----------|---------|
| Single error envelope; unknown route 404; malformed JSON 400; oversized body 413; unexpected error 500 without stack leak | `test/app.test.ts`, `test/errorHandler.test.ts` | route 404, `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, generic 500 |
| Auth: missing/malformed/expired/invalid token → 401 + `WWW-Authenticate` | `test/authenticate.test.ts` | all 401 variants + valid token 200 |
| Cursor pagination (stable order, documentId tie-break, malformed cursor 400) | `test/collections.test.ts`, `test/items.test.ts` | pagination + tie-break + `INVALID_CURSOR` |
| Item filters (priority / tag / both) | `test/items.test.ts` | `filters by priority, by tag, and by both` |
| `GET /collections/:id` embeds first page of items | `test/items.test.ts` | `25 items -> first 20 embedded with itemsNextCursor set` |
| Per-user rate limit (429 + `Retry-After`, uid-scoped, `/health` exempt) | `test/rateLimit.test.ts` | all three |
| Idempotency-Key (replay, mismatch 422, parallel, invalid 400) | `test/idempotency.test.ts` | all |
| X-Request-Id + access-log route template (ids → `:param`) | `test/requestId.test.ts`, `test/accessLog.test.ts` | all |

## Running

```bash
cd functions
npm test   # firebase emulators:exec --only auth,firestore "jest --runInBand"
```
