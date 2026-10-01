import { RequestHandler, Request, Response, NextFunction } from "express";
import { auth } from "../config/firebase";
import { UnauthorizedError } from "../errors";

// Pull the token out of an "Authorization: Bearer <token>" header.
// Returns null when the scheme is not Bearer (case-insensitive) or the token is
// empty/missing, so the caller can answer INVALID_AUTH_HEADER.
function parseBearerToken(headerValue: string): string | null {
  const parts = headerValue.trim().split(/\s+/);
  if (parts.length !== 2) {
    return null;
  }
  const [scheme, token] = parts;
  if (scheme.toLowerCase() !== "bearer" || token.length === 0) {
    return null;
  }
  return token;
}

// Firebase Auth throws errors whose `code` looks like "auth/id-token-expired".
// Only these map to 401; anything else (network, config) is a real failure.
function isFirebaseAuthError(err: unknown): err is { code: string } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    (err as { code: string }).code.startsWith("auth/")
  );
}

// Every 401 carries an RFC 6750 WWW-Authenticate challenge, then flows through
// the standard error handler for a consistent body. A plain "Bearer" is used
// when no (valid-shaped) token was supplied; once a token was supplied but
// rejected, §3.1 says to return error="invalid_token".
function unauthorized(
  res: Response,
  next: NextFunction,
  message: string,
  code: string,
  challenge = "Bearer",
): void {
  res.set("WWW-Authenticate", challenge);
  next(new UnauthorizedError(message, code));
}

export const authenticate: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.get("authorization");

  // 1. No Authorization header at all.
  if (!authHeader) {
    return unauthorized(res, next, "Authentication token is missing", "MISSING_TOKEN");
  }

  // 2. Header present but not a non-empty Bearer token.
  const token = parseBearerToken(authHeader);
  if (token === null) {
    return unauthorized(
      res,
      next,
      "Authorization header must be in the form 'Bearer <token>'",
      "INVALID_AUTH_HEADER",
    );
  }

  try {
    // checkRevoked is intentionally NOT used: it adds a lookup to the Auth
    // backend on every request. We accept that a token revoked mid-session stays
    // valid until it naturally expires (<= 1h) in exchange for lower latency and
    // no extra dependency on each call.
    const decoded = await auth.verifyIdToken(token);
    req.user = { uid: decoded.uid };
    return next();
  } catch (err) {
    // 3. auth/* errors are client token problems -> 401.
    if (isFirebaseAuthError(err)) {
      // A token was supplied but rejected -> RFC 6750 §3.1 error="invalid_token".
      const challenge = 'Bearer error="invalid_token"';
      if (err.code === "auth/id-token-expired") {
        return unauthorized(res, next, "Authentication token has expired", "TOKEN_EXPIRED", challenge);
      }
      return unauthorized(res, next, "Authentication token is invalid", "INVALID_TOKEN", challenge);
    }
    // 4. Non-auth failure (e.g. Google public keys unreachable): not the client's
    // fault, so propagate unchanged -> generic 500 in the error handler.
    return next(err);
  }
};

// Read the authenticated user in a controller. Missing req.user means a route
// was wired without the authenticate middleware — a programming error, so we
// throw a plain Error that surfaces as a 500, never a 401.
export function getAuthUser(req: Request): { uid: string } {
  if (!req.user) {
    throw new Error("getAuthUser called on a request without authenticate middleware");
  }
  return req.user;
}
