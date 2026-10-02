import request from "supertest";
import { Timestamp } from "firebase-admin/firestore";
import { app } from "../src/app";
import { db } from "../src/config/firebase";

const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = process.env.GCLOUD_PROJECT ?? "collectify-case";

// Wipe all Firestore data between tests so counts/locks start clean.
async function clearFirestore(): Promise<void> {
  await fetch(
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
}

// Create a fresh emulator user and return a usable ID token + uid.
async function signUp(): Promise<{ token: string; uid: string }> {
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
  return { token: data.idToken, uid: data.localId };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await clearFirestore();
});

describe("POST /collections", () => {
  it("creates a collection: 201 + Location + DTO without nameKey", async () => {
    const { token, uid } = await signUp();

    const res = await request(app)
      .post("/collections")
      .set(auth(token))
      .send({ name: "Recipes", description: "my food" });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/collections/${res.body.data.id}`);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      userId: uid,
      name: "Recipes",
      description: "my food",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(res.body.data).not.toHaveProperty("nameKey");
  });

  it("rejects an unknown body field -> 400", async () => {
    const { token } = await signUp();
    const res = await request(app)
      .post("/collections")
      .set(auth(token))
      .send({ name: "X", color: "red" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an empty name and a 101-char name -> 400", async () => {
    const { token } = await signUp();

    const empty = await request(app).post("/collections").set(auth(token)).send({ name: "   " });
    expect(empty.status).toBe(400);

    const tooLong = await request(app)
      .post("/collections")
      .set(auth(token))
      .send({ name: "a".repeat(101) });
    expect(tooLong.status).toBe(400);
  });

  it('"Recipes" then " recipes " -> 409 DUPLICATE_COLLECTION_NAME', async () => {
    const { token } = await signUp();

    const first = await request(app).post("/collections").set(auth(token)).send({ name: "Recipes" });
    expect(first.status).toBe(201);

    const dup = await request(app)
      .post("/collections")
      .set(auth(token))
      .send({ name: " recipes " });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("DUPLICATE_COLLECTION_NAME");
  });

  it("21st collection -> 409 COLLECTION_LIMIT_REACHED", async () => {
    const { token } = await signUp();

    for (let i = 0; i < 20; i++) {
      const res = await request(app).post("/collections").set(auth(token)).send({ name: `C${i}` });
      expect(res.status).toBe(201);
    }

    const over = await request(app).post("/collections").set(auth(token)).send({ name: "C20" });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("COLLECTION_LIMIT_REACHED");
  });

  // The same-name parallel-create test lives in collectionsParallel.test.ts so a
  // jest.retryTimes can be scoped to it alone (emulator transaction contention).
});

describe("ownership (404, never 403)", () => {
  it("another user's collection -> 404 on GET and PUT", async () => {
    const userA = await signUp();
    const userB = await signUp();

    const created = await request(app)
      .post("/collections")
      .set(auth(userA.token))
      .send({ name: "A-only" });
    const id = created.body.data.id;

    const get = await request(app).get(`/collections/${id}`).set(auth(userB.token));
    expect(get.status).toBe(404);
    expect(get.body.error.code).toBe("COLLECTION_NOT_FOUND");

    const put = await request(app)
      .put(`/collections/${id}`)
      .set(auth(userB.token))
      .send({ name: "hijack" });
    expect(put.status).toBe(404);
  });
});

describe("PUT /collections/:id (rename + lock)", () => {
  it('"Recipes" -> "RECIPES" succeeds (same lock)', async () => {
    const { token } = await signUp();
    const created = await request(app)
      .post("/collections")
      .set(auth(token))
      .send({ name: "Recipes" });
    const id = created.body.data.id;

    const res = await request(app)
      .put(`/collections/${id}`)
      .set(auth(token))
      .send({ name: "RECIPES" });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("RECIPES");
  });

  it("renaming onto another collection's name -> 409", async () => {
    const { token } = await signUp();
    await request(app).post("/collections").set(auth(token)).send({ name: "Books" });
    const second = await request(app)
      .post("/collections")
      .set(auth(token))
      .send({ name: "Movies" });

    const res = await request(app)
      .put(`/collections/${second.body.data.id}`)
      .set(auth(token))
      .send({ name: "Books" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DUPLICATE_COLLECTION_NAME");
  });

  it("after a rename the old name can be reused", async () => {
    const { token } = await signUp();
    const created = await request(app)
      .post("/collections")
      .set(auth(token))
      .send({ name: "Alpha" });

    const renamed = await request(app)
      .put(`/collections/${created.body.data.id}`)
      .set(auth(token))
      .send({ name: "Beta" });
    expect(renamed.status).toBe(200);

    const reuse = await request(app).post("/collections").set(auth(token)).send({ name: "Alpha" });
    expect(reuse.status).toBe(201);
  });
});

describe("GET /collections (cursor pagination)", () => {
  it("20 records via the API, limit=7 -> 7/7/6, last page nextCursor null, createdAt desc", async () => {
    const { token } = await signUp();

    const createdIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      const res = await request(app).post("/collections").set(auth(token)).send({ name: `C${i}` });
      expect(res.status).toBe(201);
      createdIds.push(res.body.data.id);
    }

    const seen: { id: string; createdAt: string }[] = [];
    const pageSizes: number[] = [];
    let cursor: string | null = null;

    do {
      const res: request.Response = await request(app)
        .get("/collections")
        .query(cursor ? { limit: 7, cursor } : { limit: 7 })
        .set(auth(token));
      expect(res.status).toBe(200);
      pageSizes.push(res.body.data.length);
      for (const item of res.body.data) {
        seen.push({ id: item.id, createdAt: item.createdAt });
      }
      cursor = res.body.pagination.nextCursor;
    } while (cursor !== null);

    expect(pageSizes).toEqual([7, 7, 6]);
    const ids = seen.map((s) => s.id);
    expect(ids).toHaveLength(20);
    expect(new Set(ids)).toEqual(new Set(createdIds)); // every id exactly once, no gaps

    // Ordering is createdAt desc (ISO 8601 strings compare chronologically).
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i - 1].createdAt >= seen[i].createdAt).toBe(true);
    }
  });

  it("documentId tie-break: 5 docs with identical createdAt, limit=2 -> each id exactly once", async () => {
    const { token, uid } = await signUp();

    // Seed ONLY here: the API uses serverTimestamp and cannot produce the same
    // millisecond on purpose, so we write a fixed identical createdAt to force a
    // tie and prove the documentId tie-break keeps pagination stable (no
    // repeats, no gaps) even when the primary sort key is equal.
    const fixed = Timestamp.fromMillis(1_700_000_000_000);
    const seededIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const ref = db.collection("users").doc(uid).collection("collections").doc();
      await ref.set({
        userId: uid,
        name: `Tie ${i}`,
        nameKey: `tie ${i}`,
        description: "",
        createdAt: fixed,
        updatedAt: fixed,
      });
      seededIds.push(ref.id);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res: request.Response = await request(app)
        .get("/collections")
        .query(cursor ? { limit: 2, cursor } : { limit: 2 })
        .set(auth(token));
      expect(res.status).toBe(200);
      for (const item of res.body.data) {
        seen.push(item.id);
      }
      cursor = res.body.pagination.nextCursor;
    } while (cursor !== null);

    expect(seen).toHaveLength(5);
    expect(new Set(seen)).toEqual(new Set(seededIds));
  });

  it("a malformed cursor -> 400 INVALID_CURSOR", async () => {
    const { token } = await signUp();
    const res = await request(app)
      .get("/collections")
      .query({ cursor: "not-a-valid-cursor!!!" })
      .set(auth(token));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_CURSOR");
  });
});
