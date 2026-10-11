import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DayResponse } from "@shared/types.ts";
import { qk } from "@client/lib/queryKeys.ts";
import { createSaveQueueStore } from "@client/lib/saveQueueContext.ts";

// The React-side glue of the save queue: optimistic cache writes and the send mapping (2xx → ok,
// 400/404/409 → drop + reload the day, 401 → pause + recheck the session, anything else → retry).

const DAY = "2026-10-11";
const LESSON = 7;

const fetchMock = vi.fn<typeof fetch>();

function dayWith(marks: DayResponse["lessons"][number]["marks"] = {}): DayResponse {
  return {
    date: DAY,
    lessons: [{ id: LESSON, date: DAY, subjectId: 1, pointsClean: 1, pointsWarning: 0, pointsPenalty: -1, marks }],
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function errorResponse(status: number, code: string) {
  return jsonResponse({ error: { code, message: "Nope." } }, status);
}

/** Echoes a PUT mark back the way the server stores it. */
async function echoMark(input: RequestInfo | URL, init?: RequestInit) {
  const [, lessonId, studentId] = /lessons\/(\d+)\/marks\/(\d+)/.exec(String(input)) ?? [];
  const { status, clientTs } = JSON.parse(String(init?.body)) as { status: string; clientTs: number };
  return jsonResponse({ lessonId: Number(lessonId), studentId: Number(studentId), status, updatedAt: clientTs });
}

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(qk.day(DAY), dayWith());
  const store = createSaveQueueStore(qc, memoryStorage());
  const markOf = (studentId: number) => qc.getQueryData<DayResponse>(qk.day(DAY))?.lessons[0].marks[studentId];
  return { qc, store, markOf };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("save queue store", () => {
  it("writes the optimistic mark into the day cache straight away", () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // the save never answers
    const { store, markOf } = setup();

    store.enqueueMark(DAY, LESSON, 1, "warning");

    expect(markOf(1)?.status).toBe("warning");
    expect(store.getSnapshot()).toMatchObject({ state: "saving", size: 1 });
  });

  it("2xx: saves and keeps the server's copy of the mark", async () => {
    fetchMock.mockImplementation(echoMark);
    const { store, markOf } = setup();

    store.enqueueMark(DAY, LESSON, 1, "penalty");
    await store.queue.flush();

    expect(store.getSnapshot()).toMatchObject({ state: "saved", size: 0 });
    expect(markOf(1)?.status).toBe("penalty");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`/api/lessons/${LESSON}/marks/1`);
    expect(init?.method).toBe("PUT");
  });

  it.each([400, 404, 409])("%i: drops the entry and reloads the day", async (status) => {
    fetchMock.mockResolvedValue(errorResponse(status, "BAD_REQUEST"));
    const { qc, store } = setup();

    store.enqueueMark(DAY, LESSON, 1, "warning");
    await store.queue.flush();

    expect(store.getSnapshot().size).toBe(0);
    expect(qc.getQueryState(qk.day(DAY))?.isInvalidated).toBe(true);
  });

  it("401: pauses with the tap kept, rechecks the session, and saves after retryNow", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401, "UNAUTHORIZED"));
    const { qc, store } = setup();
    qc.setQueryData(qk.auth, { setupDone: true, loggedIn: true, adminUnlocked: false, adminUntil: null });

    store.enqueueMark(DAY, LESSON, 1, "warning");
    await store.queue.flush();

    expect(store.getSnapshot()).toMatchObject({ state: "error", size: 1 });
    expect(qc.getQueryState(qk.auth)?.isInvalidated).toBe(true);

    await store.queue.flush(); // still paused: nothing is sent
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockImplementation(echoMark);
    store.retryNow();
    await store.queue.flush();
    expect(store.getSnapshot()).toMatchObject({ state: "saved", size: 0 });
  });

  it("5xx and network failures keep the entry for a retry", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(500, "INTERNAL"));
    const { store } = setup();

    store.enqueueMark(DAY, LESSON, 1, "warning");
    await store.queue.flush();
    expect(store.getSnapshot()).toMatchObject({ state: "error", size: 1 });

    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    store.retryNow();
    await store.queue.flush();
    expect(store.getSnapshot()).toMatchObject({ state: "error", size: 1 });
  });

  it("restarts a day load that was already in flight when the save landed", async () => {
    const { qc, store, markOf } = setup();
    // The load started before the save reached the server, so its answer is missing the tap.
    let answerStaleLoad: (day: DayResponse) => void = () => {};
    const loadDay = vi
      .fn<() => Promise<DayResponse>>()
      .mockImplementationOnce(() => new Promise((resolve) => (answerStaleLoad = resolve)))
      .mockImplementation(async () => dayWith({ 1: { status: "warning", updatedAt: 5 } }));
    const staleLoad = qc.fetchQuery({ queryKey: qk.day(DAY), queryFn: loadDay, staleTime: 0 });
    fetchMock.mockImplementation(echoMark);

    store.enqueueMark(DAY, LESSON, 1, "warning");
    await store.queue.flush();
    answerStaleLoad(dayWith());
    await staleLoad.catch(() => {});
    await vi.waitFor(() => expect(qc.getQueryState(qk.day(DAY))?.fetchStatus).toBe("idle"));

    expect(loadDay).toHaveBeenCalledTimes(2);
    expect(markOf(1)?.status).toBe("warning");
  });
});
