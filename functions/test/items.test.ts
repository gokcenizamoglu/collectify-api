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

async function createCollection(token: string): Promise<string> {
  const res = await request(app)
    .post("/collections")
    .set(auth(token))
    .send({ name: `Col-${Math.random().toString(36).slice(2, 8)}` });
  return res.body.data.id;
}

function postItem(
  token: string,
  cid: string,
  body: Record<string, unknown>,
): request.Test {
  return request(app).post(`/collections/${cid}/items`).set(auth(token)).send(body);
}

beforeEach(async () => {
  await clearFirestore();
});

describe("POST items", () => {
  it("creates an item: 201 + Location; priority defaults to medium; url/imageUrl null", async () => {
    const { token, uid } = await signUp();
    const cid = await createCollection(token);

    const res = await postItem(token, cid, { title: "My item" });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/collections/${cid}/items/${res.body.data.id}`);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      collectionId: cid,
      userId: uid,
      title: "My item",
      content: "",
      url: null,
      imageUrl: null,
      tags: [],
      priority: "medium",
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("validation: title 2/101, priority 'urgent', url 'ftp://', unknown field -> 400", async () => {
    const { token } = await signUp();
    const cid = await createCollection(token);

    expect((await postItem(token, cid, { title: "ab" })).status).toBe(400);
    expect((await postItem(token, cid, { title: "a".repeat(101) })).status).toBe(400);
    expect((await postItem(token, cid, { title: "valid", priority: "urgent" })).status).toBe(400);
    expect((await postItem(token, cid, { title: "valid", url: "ftp://example.com" })).status).toBe(
      400,
    );
    expect((await postItem(token, cid, { title: "valid", bogus: 1 })).status).toBe(400);
  });

  it('tags ["Travel", " travel ", "food"] -> ["travel", "food"]', async () => {
    const { token } = await signUp();
    const cid = await createCollection(token);

    const res = await postItem(token, cid, { title: "Tagged", tags: ["Travel", " travel ", "food"] });

    expect(res.status).toBe(201);
    expect(res.body.data.tags).toEqual(["travel", "food"]);
  });

  it("item in a non-existent collection -> 404 COLLECTION_NOT_FOUND", async () => {
    const { token } = await signUp();
    const res = await postItem(token, "no-such-collection", { title: "Orphan" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("COLLECTION_NOT_FOUND");
  });
});

describe("items ownership (404, never 403)", () => {
  it("user B cannot GET/PUT/DELETE user A's item", async () => {
    const userA = await signUp();
    const userB = await signUp();
    const cid = await createCollection(userA.token);
    const created = await postItem(userA.token, cid, { title: "A's item" });
    const itemId = created.body.data.id;

    const base = `/collections/${cid}/items/${itemId}`;
    const get = await request(app).get(base).set(auth(userB.token));
    const put = await request(app).put(base).set(auth(userB.token)).send({ title: "hijack" });
    const del = await request(app).delete(base).set(auth(userB.token));

    expect(get.status).toBe(404);
    expect(put.status).toBe(404);
    expect(del.status).toBe(404);
    expect(get.body.error.code).toBe("ITEM_NOT_FOUND");
  });
});

describe("PUT items", () => {
  it("imageUrl: null clears the field", async () => {
    const { token } = await signUp();
    const cid = await createCollection(token);
    const created = await postItem(token, cid, {
      title: "With image",
      imageUrl: "https://example.com/a.png",
    });
    expect(created.body.data.imageUrl).toBe("https://example.com/a.png");

    const res = await request(app)
      .put(`/collections/${cid}/items/${created.body.data.id}`)
      .set(auth(token))
      .send({ imageUrl: null });

    expect(res.status).toBe(200);
    expect(res.body.data.imageUrl).toBeNull();
  });

  it("empty body -> 400", async () => {
    const { token } = await signUp();
    const cid = await createCollection(token);
    const created = await postItem(token, cid, { title: "Item" });

    const res = await request(app)
      .put(`/collections/${cid}/items/${created.body.data.id}`)
      .set(auth(token))
      .send({});

    expect(res.status).toBe(400);
  });
});

describe("GET items (filters + pagination)", () => {
  it("filters by priority, by tag, and by both", async () => {
    const { token } = await signUp();
    const cid = await createCollection(token);
    await postItem(token, cid, { title: "High travel", priority: "high", tags: ["travel"] });
    await postItem(token, cid, { title: "Low food", priority: "low", tags: ["food"] });
    await postItem(token, cid, { title: "High both", priority: "high", tags: ["travel", "food"] });

    const byPriority = await request(app)
      .get(`/collections/${cid}/items`)
      .query({ priority: "high" })
      .set(auth(token));
    expect(byPriority.body.data).toHaveLength(2);

    const byTag = await request(app)
      .get(`/collections/${cid}/items`)
      .query({ tag: "travel" })
      .set(auth(token));
    expect(byTag.body.data).toHaveLength(2);

    const byBoth = await request(app)
      .get(`/collections/${cid}/items`)
      .query({ priority: "high", tag: "food" })
      .set(auth(token));
    expect(byBoth.body.data).toHaveLength(1);
    expect(byBoth.body.data[0].title).toBe("High both");
  });

  it("15 items, limit=6 -> 6/6/3, every id exactly once", async () => {
    const { token } = await signUp();
    const cid = await createCollection(token);

    const createdIds: string[] = [];
    for (let i = 0; i < 15; i++) {
      const res = await postItem(token, cid, { title: `Item ${i}` });
      createdIds.push(res.body.data.id);
    }

    const seen: string[] = [];
    const pageSizes: number[] = [];
    let cursor: string | null = null;
    do {
      const res: request.Response = await request(app)
        .get(`/collections/${cid}/items`)
        .query(cursor ? { limit: 6, cursor } : { limit: 6 })
        .set(auth(token));
      expect(res.status).toBe(200);
      pageSizes.push(res.body.data.length);
      for (const item of res.body.data) {
        seen.push(item.id);
      }
      cursor = res.body.pagination.nextCursor;
    } while (cursor !== null);

    expect(pageSizes).toEqual([6, 6, 3]);
    expect(new Set(seen)).toEqual(new Set(createdIds));
  });
});

describe("GET /collections/:id embeds items", () => {
  it("25 items -> first 20 embedded with itemsNextCursor set", async () => {
    const { token } = await signUp();
    const cid = await createCollection(token);
    for (let i = 0; i < 25; i++) {
      await postItem(token, cid, { title: `Item ${i}` });
    }

    const res = await request(app).get(`/collections/${cid}`).set(auth(token));

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(cid);
    expect(res.body.data.items).toHaveLength(20);
    expect(typeof res.body.data.itemsNextCursor).toBe("string");
  });
});

describe("DELETE items", () => {
  it("delete -> 204, then GET -> 404", async () => {
    const { token } = await signUp();
    const cid = await createCollection(token);
    const created = await postItem(token, cid, { title: "To delete" });
    const base = `/collections/${cid}/items/${created.body.data.id}`;

    const del = await request(app).delete(base).set(auth(token));
    expect(del.status).toBe(204);

    const get = await request(app).get(base).set(auth(token));
    expect(get.status).toBe(404);
    expect(get.body.error.code).toBe("ITEM_NOT_FOUND");
  });
});
