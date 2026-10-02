import request from "supertest";
import { app } from "../src/app";

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? "collectify-case";

async function clearFirestore(): Promise<void> {
  await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
}

async function signUpToken(): Promise<string> {
  const email = `idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
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
const freshKey = () => `idem-${Math.random().toString(36).slice(2, 14)}`;

async function collectionCount(token: string): Promise<number> {
  const res = await request(app).get("/collections").query({ limit: 100 }).set(auth(token));
  return res.body.data.length;
}

beforeEach(async () => {
  await clearFirestore();
});

describe("Idempotency-Key on POST /collections", () => {
  it("same key + same body -> both 201, same id, replayed header, single record", async () => {
    const token = await signUpToken();
    const key = freshKey();

    const first = await request(app)
      .post("/collections")
      .set(auth(token))
      .set("Idempotency-Key", key)
      .send({ name: "Recipes" });
    expect(first.status).toBe(201);
    expect(first.headers["idempotent-replayed"]).toBeUndefined();

    const replay = await request(app)
      .post("/collections")
      .set(auth(token))
      .set("Idempotency-Key", key)
      .send({ name: "Recipes" });
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(replay.headers["idempotent-replayed"]).toBe("true");

    expect(await collectionCount(token)).toBe(1);
  });

  it("same key + different body -> 422 IDEMPOTENCY_KEY_MISMATCH", async () => {
    const token = await signUpToken();
    const key = freshKey();

    await request(app)
      .post("/collections")
      .set(auth(token))
      .set("Idempotency-Key", key)
      .send({ name: "First" })
      .expect(201);

    const mismatch = await request(app)
      .post("/collections")
      .set(auth(token))
      .set("Idempotency-Key", key)
      .send({ name: "Second" });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.code).toBe("IDEMPOTENCY_KEY_MISMATCH");
  });

  it("two parallel POSTs with the same key -> same id, single record", async () => {
    const token = await signUpToken();
    const key = freshKey();

    const [a, b] = await Promise.all([
      request(app)
        .post("/collections")
        .set(auth(token))
        .set("Idempotency-Key", key)
        .send({ name: "Parallel" }),
      request(app)
        .post("/collections")
        .set(auth(token))
        .set("Idempotency-Key", key)
        .send({ name: "Parallel" }),
    ]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.data.id).toBe(b.body.data.id);
    expect(await collectionCount(token)).toBe(1);
  });

  it("invalid key format -> 400 INVALID_IDEMPOTENCY_KEY", async () => {
    const token = await signUpToken();
    const res = await request(app)
      .post("/collections")
      .set(auth(token))
      .set("Idempotency-Key", "bad key!")
      .send({ name: "X" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_IDEMPOTENCY_KEY");
  });
});

describe("Idempotency-Key on POST items", () => {
  it("without a key, two POSTs create two distinct items (unchanged behavior)", async () => {
    const token = await signUpToken();
    const col = await request(app).post("/collections").set(auth(token)).send({ name: "Col" });
    const cid = col.body.data.id;

    const a = await request(app).post(`/collections/${cid}/items`).set(auth(token)).send({ title: "Item" });
    const b = await request(app).post(`/collections/${cid}/items`).set(auth(token)).send({ title: "Item" });

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.data.id).not.toBe(b.body.data.id);
  });

  it("same key -> replayed, single item", async () => {
    const token = await signUpToken();
    const col = await request(app).post("/collections").set(auth(token)).send({ name: "Col" });
    const cid = col.body.data.id;
    const key = freshKey();

    const first = await request(app)
      .post(`/collections/${cid}/items`)
      .set(auth(token))
      .set("Idempotency-Key", key)
      .send({ title: "Saved once" });
    const replay = await request(app)
      .post(`/collections/${cid}/items`)
      .set(auth(token))
      .set("Idempotency-Key", key)
      .send({ title: "Saved once" });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(replay.headers["idempotent-replayed"]).toBe("true");

    const list = await request(app).get(`/collections/${cid}/items`).set(auth(token));
    expect(list.body.data).toHaveLength(1);
  });
});
