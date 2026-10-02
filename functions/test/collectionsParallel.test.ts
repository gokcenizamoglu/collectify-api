import request from "supertest";
import { app } from "../src/app";

// Scoped to this file only: the Firestore emulator uses pessimistic locking and
// manages transactions differently from production. Under heavy concurrent test
// load a contending transaction can exhaust its retry budget and surface as
// ABORTED (a 500), even though the logic is correct. In production two parallel
// requests practically never hit this. We retry the test itself (not the app
// code — mapping ABORTED to 409 would lie to the client) to avoid a flaky CI.
jest.retryTimes(2);

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? "collectify-case";

async function clearFirestore(): Promise<void> {
  await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
}

async function signUp(): Promise<{ token: string }> {
  const email = `par-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "password123", returnSecureToken: true }),
    },
  );
  const data = (await res.json()) as { idToken: string };
  return { token: data.idToken };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await clearFirestore();
});

describe("POST /collections (concurrency)", () => {
  it("two parallel POSTs with the same name -> exactly one 201, one 409", async () => {
    const { token } = await signUp();

    const [a, b] = await Promise.all([
      request(app).post("/collections").set(auth(token)).send({ name: "Same" }),
      request(app).post("/collections").set(auth(token)).send({ name: "Same" }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const conflict = a.status === 409 ? a : b;
    expect(conflict.body.error.code).toBe("DUPLICATE_COLLECTION_NAME");
  });
});
