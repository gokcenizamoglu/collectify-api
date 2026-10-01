import request from "supertest";
import { app } from "../src/app";

describe("app skeleton", () => {
  it("GET /health -> 200 with the exact payload", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "ok",
      serviceId: "ppc-collectify-svc-a1b2c3d4e5f6-us-central1-prod-v2.4.1-rev8a3f",
    });
  });

  it("unknown route -> 404 in the standard error shape", async () => {
    const res = await request(app).get("/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: expect.stringContaining("Route not found"),
      },
    });
  });

  it("malformed JSON body -> 400 INVALID_JSON (not 500)", async () => {
    const res = await request(app)
      .post("/health")
      .set("Content-Type", "application/json")
      .send('{"broken": ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: "INVALID_JSON", message: "Request body is not valid JSON" },
    });
  });

  it("body over the 100kb limit -> 413 PAYLOAD_TOO_LARGE in the standard shape", async () => {
    // ~110kb of valid JSON, comfortably over the express.json 100kb cap.
    const oversized = { data: "a".repeat(110 * 1024) };

    const res = await request(app)
      .post("/health")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(oversized));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" },
    });
  });
});
