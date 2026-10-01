import express from "express";
import request from "supertest";
import { authenticate, getAuthUser } from "../src/middleware/authenticate";
import { errorHandler } from "../src/middleware/errorHandler";

// Mini app exercising authenticate on a dummy protected route. We deliberately
// do NOT add this route to the real API — it exists only for this test.
function protectedApp(): express.Express {
  const app = express();
  app.get("/private", authenticate, (req, res) => {
    res.status(200).json({ uid: getAuthUser(req).uid });
  });
  app.use(errorHandler);
  return app;
}

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? "collectify-case";

// Base64url without padding, for hand-crafting unsigned emulator tokens.
function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

// Create a real user in the Auth emulator and return its ID token + uid.
async function signUpTestUser(): Promise<{ idToken: string; uid: string }> {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123", returnSecureToken: true }),
    },
  );
  const data = (await res.json()) as { idToken: string; localId: string };
  return { idToken: data.idToken, uid: data.localId };
}

// The Auth emulator accepts unsigned tokens (alg "none"), so we can mint one
// whose exp is in the past to trigger auth/id-token-expired.
function expiredToken(): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "none", typ: "JWT" };
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: "expired-user",
    user_id: "expired-user",
    iat: nowSeconds - 7200,
    auth_time: nowSeconds - 7200,
    exp: nowSeconds - 3600,
  };
  return `${base64url(header)}.${base64url(payload)}.`;
}

describe("authenticate", () => {
  it("no Authorization header -> 401 MISSING_TOKEN + WWW-Authenticate", async () => {
    const res = await request(protectedApp()).get("/private");

    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBe("Bearer");
    expect(res.body).toEqual({
      error: { code: "MISSING_TOKEN", message: expect.any(String) },
    });
  });

  it('non-Bearer scheme ("Basic xyz") -> 401 INVALID_AUTH_HEADER', async () => {
    const res = await request(protectedApp()).get("/private").set("Authorization", "Basic xyz");

    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBe("Bearer");
    expect(res.body.error.code).toBe("INVALID_AUTH_HEADER");
  });

  it('empty Bearer token ("Bearer ") -> 401 INVALID_AUTH_HEADER', async () => {
    const res = await request(protectedApp()).get("/private").set("Authorization", "Bearer ");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_AUTH_HEADER");
  });

  it("malformed token -> 401 INVALID_TOKEN", async () => {
    const res = await request(protectedApp())
      .get("/private")
      .set("Authorization", "Bearer not-a-real-jwt");

    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBe('Bearer error="invalid_token"');
    expect(res.body.error.code).toBe("INVALID_TOKEN");
  });

  it("valid emulator token -> 200 with the correct uid", async () => {
    const { idToken, uid } = await signUpTestUser();

    const res = await request(protectedApp())
      .get("/private")
      .set("Authorization", `Bearer ${idToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ uid });
  });

  it("expired token -> 401 TOKEN_EXPIRED", async () => {
    const res = await request(protectedApp())
      .get("/private")
      .set("Authorization", `Bearer ${expiredToken()}`);

    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toBe('Bearer error="invalid_token"');
    expect(res.body.error.code).toBe("TOKEN_EXPIRED");
  });
});
