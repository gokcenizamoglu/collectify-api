// Field-level detail attached to validation-style errors.
export interface ErrorDetail {
  path: string;
  message: string;
}

// Base class for every error we deliberately turn into an HTTP response.
// It is abstract because only concrete subclasses (with a fixed status) are thrown.
export abstract class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: ErrorDetail[];

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetail[]) {
    super(message);
    // Use the concrete subclass name (e.g. "NotFoundError") in logs/stack traces.
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
