// Mock the logger so we can inspect the structured access-log line.
jest.mock("firebase-functions/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn(),
  debug: jest.fn(),
}));

import request from "supertest";
import * as logger from "firebase-functions/logger";
import { app } from "../src/app";

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;

async function signUpToken(): Promise<string> {
  const email = `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123", returnSecureToken: true }),
    },
  );
  const data = (await res.json()) as { idToken: string };
  return data.idToken;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

function lastAccessLog(): Record<string, unknown> | undefined {
  const info = logger.info as jest.Mock;
  const calls = info.mock.calls.filter((c) => c[0] === "request");
  return calls.length ? (calls[calls.length - 1][1] as Record<string, unknown>) : undefined;
}

describe("access log route template", () => {
  it("logs ids as :params for a nested item route", async () => {
    const token = await signUpToken();
    (logger.info as jest.Mock).mockClear();

    // Route matches even though the item doesn't exist (controller returns 404).
    await request(app)
      .get("/collections/real-cid-123/items/real-item-456")
      .set(auth(token));

    // res.on("finish") may fire just after supertest resolves.
    await new Promise((resolve) => setTimeout(resolve, 40));

    const log = lastAccessLog();
    expect(log?.route).toBe("/collections/:collectionId/items/:itemId");
  });

  it("logs a sanitized template for a top-level collection route", async () => {
    const token = await signUpToken();
    (logger.info as jest.Mock).mockClear();

    await request(app).get("/collections/some-real-id").set(auth(token));
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(lastAccessLog()?.route).toBe("/collections/:collectionId");
  });

  it("logs 'unmatched' for an unknown route", async () => {
    (logger.info as jest.Mock).mockClear();
    await request(app).get("/no-such-route");
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(lastAccessLog()?.route).toBe("unmatched");
  });
});
