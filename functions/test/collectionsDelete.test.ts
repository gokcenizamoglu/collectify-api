import request from "supertest";
import { FieldValue } from "firebase-admin/firestore";
import { app } from "../src/app";
import { db } from "../src/config/firebase";

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

async function createCollection(token: string, name: string): Promise<string> {
  const res = await request(app).post("/collections").set(auth(token)).send({ name });
  return res.body.data.id;
}

// Count docs remaining directly in the items subcollection (bypasses the API).
async function itemCount(uid: string, cid: string): Promise<number> {
  const snap = await db.collection("users").doc(uid).collection("collections").doc(cid).collection("items").get();
  return snap.size;
}

beforeEach(async () => {
  await clearFirestore();
});

describe("DELETE /collections/:id", () => {
  it("deletes a collection with items -> 204; GET 404; items subcollection empty", async () => {
    const { token, uid } = await signUp();
    const cid = await createCollection(token, "Recipes");
    await request(app).post(`/collections/${cid}/items`).set(auth(token)).send({ title: "Item one" });
    await request(app).post(`/collections/${cid}/items`).set(auth(token)).send({ title: "Item two" });

    const del = await request(app).delete(`/collections/${cid}`).set(auth(token));
    expect(del.status).toBe(204);

    const get = await request(app).get(`/collections/${cid}`).set(auth(token));
    expect(get.status).toBe(404);
    expect(get.body.error.code).toBe("COLLECTION_NOT_FOUND");

    expect(await itemCount(uid, cid)).toBe(0);
  });

  it("the deleted name can be used again (lock released)", async () => {
    const { token } = await signUp();
    const cid = await createCollection(token, "Recipes");

    await request(app).delete(`/collections/${cid}`).set(auth(token)).expect(204);

    const recreate = await request(app).post("/collections").set(auth(token)).send({ name: "Recipes" });
    expect(recreate.status).toBe(201);
  });

  it("counter: 20 created, delete 1, create 1 ok, next -> 409", async () => {
    const { token } = await signUp();
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      ids.push(await createCollection(token, `C${i}`));
    }

    await request(app).delete(`/collections/${ids[0]}`).set(auth(token)).expect(204);

    const ok = await request(app).post("/collections").set(auth(token)).send({ name: "Fresh" });
    expect(ok.status).toBe(201);

    const over = await request(app).post("/collections").set(auth(token)).send({ name: "Over" });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe("COLLECTION_LIMIT_REACHED");
  });

  it("deleting the same collection twice -> second is 404", async () => {
    const { token } = await signUp();
    const cid = await createCollection(token, "Once");

    await request(app).delete(`/collections/${cid}`).set(auth(token)).expect(204);
    const second = await request(app).delete(`/collections/${cid}`).set(auth(token));
    expect(second.status).toBe(404);
    expect(second.body.error.code).toBe("COLLECTION_NOT_FOUND");
  });

  it("user B cannot delete user A's collection -> 404, A's collection survives", async () => {
    const userA = await signUp();
    const userB = await signUp();
    const cid = await createCollection(userA.token, "A-only");

    const del = await request(app).delete(`/collections/${cid}`).set(auth(userB.token));
    expect(del.status).toBe(404);

    const stillThere = await request(app).get(`/collections/${cid}`).set(auth(userA.token));
    expect(stillThere.status).toBe(200);
  });

  it("deletes a collection with 550 items (beyond the 500 transaction cap)", async () => {
    const { token, uid } = await signUp();
    const cid = await createCollection(token, "Big");

    // Seed 550 items directly: a transaction caps at 500 writes, so this proves
    // recursiveDelete (which runs outside the transaction) clears more than a
    // single transaction ever could. The API would also work but is far slower.
    const itemsCol = db.collection("users").doc(uid).collection("collections").doc(cid).collection("items");
    for (let start = 0; start < 550; start += 500) {
      const batch = db.batch();
      for (let i = start; i < Math.min(start + 500, 550); i++) {
        batch.set(itemsCol.doc(), {
          collectionId: cid,
          userId: uid,
          title: `Item ${i}`,
          content: "",
          url: null,
          imageUrl: null,
          tags: [],
          priority: "medium",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    }
    expect(await itemCount(uid, cid)).toBe(550);

    const del = await request(app).delete(`/collections/${cid}`).set(auth(token));
    expect(del.status).toBe(204);
    expect(await itemCount(uid, cid)).toBe(0);
  });
});
