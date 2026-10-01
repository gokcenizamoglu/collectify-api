import express from "express";
import request from "supertest";
import * as logger from "firebase-functions/logger";
import { errorHandler } from "../src/middleware/errorHandler";

// logger.error is a read-only export, so mock the whole module to capture calls.
jest.mock("firebase-functions/logger", () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  log: jest.fn(),
  debug: jest.fn(),
}));

// Build a minimal app whose single route throws an unexpected (non-AppError)
// error, so we exercise the error handler's generic 500 branch in isolation.
function appThatThrows(err: Error): express.Express {
  const testApp = express();
  testApp.get("/boom", () => {
    throw err;
  });
  testApp.use(errorHandler);
  return testApp;
}

describe("errorHandler — unexpected errors", () => {
  it("returns 500 INTERNAL_ERROR, logs the full error, and never leaks the stack", async () => {
    const logError = logger.error as jest.Mock;
    logError.mockClear();
    const secret = new Error("boom with sensitive detail");

    const res = await request(appThatThrows(secret)).get("/boom");

    expect(res.status).toBe(500);
    // Client sees only a generic envelope — no stack, no internal message.
    expect(res.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
    });
    expect(JSON.stringify(res.body)).not.toContain("sensitive");
    expect(JSON.stringify(res.body)).not.toContain("stack");

    // The real error is logged server-side for debugging.
    expect(logError).toHaveBeenCalledWith("Unhandled error", secret);
  });
});
