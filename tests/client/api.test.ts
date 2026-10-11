import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@client/lib/api.ts";

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** The [url, init] of the nth fetch call. */
function call(n = 0): [string, RequestInit] {
  const [url, init] = fetchMock.mock.calls[n];
  return [String(url), init ?? {}];
}

function headerOf(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("throws ApiError with code from body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: "CONFLICT", message: "Already there." } }, 409));

    const error = await api.bootstrap().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "CONFLICT", message: "Already there." });
  });

  it("reads retryAfterMs from the body, or from Retry-After", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: "RATE_LIMITED", message: "Wait.", retryAfterMs: 120_000 } }, 429),
    );
    await expect(api.login("nope")).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 120_000 });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: "RATE_LIMITED", message: "Wait." } }, 429, { "Retry-After": "90" }),
    );
    await expect(api.unlock("1234")).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 90_000 });
  });

  it("falls back to a code from the status when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>oops</html>", { status: 502 }));
    await expect(api.authStatus()).rejects.toMatchObject({ status: 502, code: "INTERNAL" });

    fetchMock.mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(api.authStatus()).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });

  it("network failure → code NETWORK", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const error = await api.day("2026-10-11").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, code: "NETWORK" });
  });

  it("sends credentials and json content-type on POST", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(api.login("correct horse")).resolves.toBeUndefined();

    const [url, init] = call();
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(headerOf(init, "Content-Type")).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({ password: "correct horse" });
  });

  it("sends a JSON body on every non-GET request, even without a payload", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ ok: true }));

    await api.logout();
    await api.deleteLesson(5);

    for (const n of [0, 1]) {
      const [, init] = call(n);
      expect(headerOf(init, "Content-Type")).toBe("application/json");
      expect(init.body).toBe("{}");
    }
    expect(call(1)[0]).toBe("/api/lessons/5");
    expect(call(1)[1].method).toBe("DELETE");
  });

  it("GETs have no body and still send credentials", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ lessons: [] }));

    await expect(api.calendar("2026-10")).resolves.toEqual({ lessons: [] });

    const [url, init] = call();
    expect(url).toBe("/api/calendar?month=2026-10");
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe("same-origin");
  });

  it("maps calls to the spec §6 routes", async () => {
    const mark = { lessonId: 3, studentId: 9, status: "warning", updatedAt: 42 };
    fetchMock.mockResolvedValueOnce(jsonResponse(mark));
    await expect(api.putMark(3, 9, "warning", 42)).resolves.toEqual(mark);
    expect(call(0)[0]).toBe("/api/lessons/3/marks/9");
    expect(call(0)[1].method).toBe("PUT");
    expect(JSON.parse(String(call(0)[1].body))).toEqual({ status: "warning", clientTs: 42 });

    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 4 }));
    await api.archiveStudent(4, "2026-10-11");
    expect(call(1)[0]).toBe("/api/students/4/archive");
    expect(JSON.parse(String(call(1)[1].body))).toEqual({ date: "2026-10-11" });

    fetchMock.mockResolvedValueOnce(jsonResponse({ lessons: [], marks: [] }));
    await api.reportRaw("2026-10-01", "2026-10-31");
    expect(call(2)[0]).toBe("/api/reports/raw?from=2026-10-01&to=2026-10-31");

    fetchMock.mockResolvedValueOnce(jsonResponse({ teacherName: "Ms Lee" }));
    await api.patchSettings({ soundOn: false });
    expect(call(3)[0]).toBe("/api/settings");
    expect(call(3)[1].method).toBe("PATCH");
    expect(JSON.parse(String(call(3)[1].body))).toEqual({ soundOn: false });
  });
});
