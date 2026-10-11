import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DayResponse } from "@shared/types.ts";
import { useDay } from "@client/lib/queries.ts";
import { qk } from "@client/lib/queryKeys.ts";
import { SaveQueueContext, createSaveQueueStore } from "@client/lib/saveQueueContext.ts";

const DAY = "2026-10-11";

const serverDay: DayResponse = {
  date: DAY,
  lessons: [
    {
      id: 7,
      date: DAY,
      subjectId: 1,
      pointsClean: 1,
      pointsWarning: 0,
      pointsPenalty: -1,
      marks: { 2: { status: "absent", updatedAt: 1 } },
    },
  ],
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (input, init) => {
    if (init?.method === "PUT") return new Promise<Response>(() => {}); // saves never answer
    expect(String(input)).toBe(`/api/days/${DAY}`);
    return new Response(JSON.stringify(serverDay), { headers: { "Content-Type": "application/json" } });
  });
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("useDay", () => {
  it("lays taps still waiting in the save queue over the server's day", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const map = new Map<string, string>();
    const store = createSaveQueueStore(qc, { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>
        <SaveQueueContext.Provider value={store}>{children}</SaveQueueContext.Provider>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useDay(DAY), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());

    store.enqueueMark(DAY, 7, 1, "warning");
    store.enqueueMark("2026-10-12", 9, 1, "penalty"); // another day: ignored here
    // A reload from the server (that doesn't have the tap yet) must not hide it.
    qc.setQueryData(qk.day(DAY), serverDay);

    await waitFor(() => expect(result.current.data?.lessons[0].marks[1]?.status).toBe("warning"));
    expect(result.current.data?.lessons[0].marks[2]?.status).toBe("absent");
    expect(qc.getQueryData<DayResponse>(qk.day(DAY))?.lessons[0].marks[1]).toBeUndefined();
  });
});
