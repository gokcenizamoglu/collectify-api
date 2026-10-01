import request from "supertest";
import { app } from "../src/app";

// Shrink the per-user limit for this suite via config (env), not a code branch.
// The limiter reads this live per request, so setting it here (before any test
// request runs) is enough; no special import ordering needed.
const TEST_LIMIT = 5;
process.env.RATE_LIMIT_MAX = String(TEST_LIMIT);

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;

async function signUpToken(): Promise<string> {
  const email = `rl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
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

// A request the limiter counts but that stays cheap: an invalid body 400s at the
// controller (no Firestore), while the limiter — which runs first — still counts it.
const hit = (token: string) => request(app).post("/collections").set(auth(token)).send({});

afterAll(() => {
  delete process.env.RATE_LIMIT_MAX;
});

describe("rate limiting (per uid)", () => {
  it("the request past the limit -> 429 RATE_LIMITED with Retry-After", async () => {
    const token = await signUpToken();

    for (let i = 0; i < TEST_LIMIT; i++) {
      const res = await hit(token);
      expect(res.status).not.toBe(429); // first `limit` requests pass the limiter
    }

    const blocked = await hit(token);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(blocked.headers["retry-after"]).toBe("60");
  });

  it("a different uid is not affected by another uid's limit", async () => {
    const tokenA = await signUpToken();
    const tokenB = await signUpToken();

    // Exhaust A.
    for (let i = 0; i <= TEST_LIMIT; i++) {
      await hit(tokenA);
    }
    expect((await hit(tokenA)).status).toBe(429);

    // B is independent.
    expect((await hit(tokenB)).status).not.toBe(429);
  });

  it("/health is not rate limited", async () => {
    const token = await signUpToken();
    for (let i = 0; i <= TEST_LIMIT; i++) {
      await hit(token);
    }
    expect((await hit(token)).status).toBe(429); // confirm this uid is limited now

    for (let i = 0; i < 3; i++) {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
    }
  });
});
