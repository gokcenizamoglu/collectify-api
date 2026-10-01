import { ErrorRequestHandler } from "express";
import * as logger from "firebase-functions/logger";
import { ZodError } from "zod";
import { AppError, ErrorDetail } from "../errors";

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
  };
}

// True only for the SyntaxError express.json() throws on an unparseable body.
// body-parser tags it with type "entity.parse.failed", which lets us tell it
// apart from any other SyntaxError and answer 400 instead of 500.
function isJsonParseError(err: unknown): boolean {
  return (
    err instanceof SyntaxError &&
    "type" in err &&
    (err as { type?: string }).type === "entity.parse.failed"
  );
}

// Shape of the client errors body-parser / http-errors raise (e.g. a body over
// the size limit). `expose: true` marks a 4xx whose status is safe to surface.
interface ExposedClientError {
  status: number;
  expose: boolean;
  type?: string;
}

function isExposedClientError(err: unknown): err is ExposedClientError {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const candidate = err as Record<string, unknown>;
  return (
    typeof candidate.status === "number" &&
    candidate.status >= 400 &&
    candidate.status < 500 &&
    candidate.expose === true
  );
}

// The ONLY place errors become HTTP responses. Registered last in app.ts.
// The 4-argument signature is what marks it as an Express error handler.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // 1. Our own domain errors already know their status, code and (maybe) details.
  if (err instanceof AppError) {
    const body: ErrorBody = { error: { code: err.code, message: err.message } };
    if (err.details) {
      body.error.details = err.details;
    }
    res.status(err.statusCode).json(body);
    return;
  }

  // 2. Zod validation errors -> 400 with one {path, message} entry per issue.
  if (err instanceof ZodError) {
    const details: ErrorDetail[] = err.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    }));
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Validation failed", details },
    });
    return;
  }

  // 3. Malformed JSON body -> 400 INVALID_JSON (a client mistake), never 500.
  if (isJsonParseError(err)) {
    res.status(400).json({
      error: { code: "INVALID_JSON", message: "Request body is not valid JSON" },
    });
    return;
  }

  // 4. Other exposed client errors from body-parser/http-errors (e.g. a body
  // exceeding the 100kb limit). Honour their 4xx status but send our own code and
  // a generic message — never err.message, which may echo internals.
  if (isExposedClientError(err)) {
    let code: string;
    let message: string;
    if (err.type === "entity.too.large") {
      code = "PAYLOAD_TOO_LARGE";
      message = "Request body is too large";
    } else if (err.status === 415) {
      code = "UNSUPPORTED_MEDIA_TYPE";
      message = "Unsupported content type";
    } else {
      code = "BAD_REQUEST";
      message = "Bad request";
    }
    res.status(err.status).json({ error: { code, message } });
    return;
  }

  // 5. Anything else is unexpected: log the full error server-side, but return a
  // generic message so no stack trace or internal detail leaks to the client.
  logger.error("Unhandled error", err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
};
