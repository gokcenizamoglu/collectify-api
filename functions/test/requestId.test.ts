import request from "supertest";
import { app } from "../src/app";

describe("X-Request-Id", () => {
  it("is generated when the client does not send one", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.headers["x-request-id"]).toMatch(/^[A-Za-z0-9-_]+$/);
    expect(res.headers["x-request-id"].length).toBeGreaterThanOrEqual(8);
  });

  it("echoes a valid client-supplied value", async () => {
    const res = await request(app).get("/health").set("X-Request-Id", "trace-abc_123");
    expect(res.headers["x-request-id"]).toBe("trace-abc_123");
  });

  it("ignores an invalid value and generates a fresh one", async () => {
    const invalid = "bad id with spaces!";
    const res = await request(app).get("/health").set("X-Request-Id", invalid);
    expect(res.headers["x-request-id"]).not.toBe(invalid);
    expect(res.headers["x-request-id"]).toMatch(/^[A-Za-z0-9-_]+$/);
  });
});
