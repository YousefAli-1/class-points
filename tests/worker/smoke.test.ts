import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("responds with ok", async () => {
    const res = await SELF.fetch("http://x/api/health");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
