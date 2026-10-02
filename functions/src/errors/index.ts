import { AppError, ErrorDetail } from "./AppError";

// 400 — request failed validation. Carries field-level details.
export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: ErrorDetail[], code = "VALIDATION_ERROR") {
    super(400, code, message, details);
  }
}

// 401 — missing or invalid authentication.
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", code = "UNAUTHORIZED") {
    super(401, code, message);
  }
}

// 404 — resource (or route) does not exist. Also used for cross-user access to
// avoid leaking existence (403 would confirm the resource is real).
export class NotFoundError extends AppError {
  constructor(message = "Resource not found", code = "NOT_FOUND") {
    super(404, code, message);
  }
}

// 409 — conflict such as a duplicate collection name or a reached limit.
// Code is required because the caller decides which conflict it is.
export class ConflictError extends AppError {
  constructor(message: string, code: string) {
    super(409, code, message);
  }
}

// 422 — syntactically valid but semantically unprocessable (e.g. an
// Idempotency-Key reused with a different request body).
export class UnprocessableEntityError extends AppError {
  constructor(message: string, code: string) {
    super(422, code, message);
  }
}

// 429 — too many requests (rate limit exceeded).
export class RateLimitError extends AppError {
  constructor(message = "Too many requests", code = "RATE_LIMITED") {
    super(429, code, message);
  }
}

export { AppError, ErrorDetail };
