// Cloud Functions deploy region (single region per CLAUDE.md).
export const REGION = "us-central1";

// Opaque service identifier returned verbatim by GET /health.
export const SERVICE_ID = "ppc-collectify-svc-a1b2c3d4e5f6-us-central1-prod-v2.4.1-rev8a3f";

// Business limits.
export const MAX_COLLECTIONS_PER_USER = 20;

// List pagination.
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

// Rate limiting: per-user, per minute.
export const RATE_LIMIT_WINDOW_MS = 60_000;

// Read live (per request) so the limit is configurable via env per environment
// (e.g. tests use a small value) without a test-only branch in the code.
// Defaults to 100 requests / window.
export function rateLimitMax(): number {
  return Number(process.env.RATE_LIMIT_MAX) || 100;
}

// Hard ceiling on concurrent function instances: a cost/abuse cap so a runaway
// loop or attack can't spin up unbounded instances (and also bounds how far the
// per-instance in-memory rate limit can be multiplied across instances).
export const MAX_INSTANCES = 10;

// Idempotency key record lifetime. The TTL policy deletes expired records within
// ~24h of this instant (not exactly at it) — long enough to absorb client retries.
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
