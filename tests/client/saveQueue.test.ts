import { describe, expect, it, vi } from "vitest";
import { SaveQueue, type QueuedMark, type SendResult } from "@client/lib/saveQueue.ts";

const DAY = "2026-10-11";
const OTHER_DAY = "2026-10-12";
const STORAGE_KEY = "cp.saveQueue.v1";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

interface Options {
  storage?: ReturnType<typeof memoryStorage>;
  results?: SendResult[];
  now?: () => number;
}

/** A queue with a scripted `send`, a manual scheduler and a switchable network. */
function makeQueue({ storage = memoryStorage(), results = [], now = () => 1_000 }: Options = {}) {
  const sent: QueuedMark[] = [];
  const send = vi.fn(async (m: QueuedMark): Promise<SendResult> => {
    sent.push(m);
    return results.shift() ?? "ok";
  });
  const scheduled: { fn: () => void; ms: number }[] = [];
  const schedule = vi.fn((fn: () => void, ms: number) => {
    scheduled.push({ fn, ms });
  });
  const onChange = vi.fn();
  let online = true;
  const queue = new SaveQueue({ storage, send, now, isOnline: () => online, schedule, onChange });
  return {
    queue,
    storage,
    send,
    sent,
    scheduled,
    onChange,
    setOnline(value: boolean) {
      online = value;
    },
  };
}

const mark = (studentId: number, status: QueuedMark["status"], date = DAY, lessonId = 7) => ({
  lessonId,
  studentId,
  status,
  date,
});

describe("SaveQueue", () => {
  it("coalesces per key", async () => {
    const { queue, sent, onChange } = makeQueue();

    queue.enqueue(mark(1, "warning"));
    queue.enqueue(mark(1, "penalty"));

    expect(queue.size).toBe(1);
    expect(queue.pendingFor(DAY).map((m) => m.status)).toEqual(["penalty"]);
    expect(onChange).toHaveBeenCalled();

    await queue.flush();
    expect(sent.map((m) => m.status)).toEqual(["penalty"]);
    expect(queue.size).toBe(0);
    expect(queue.state).toBe("saved");
  });

  it("keeps a newer entry enqueued while the older one is in flight", async () => {
    const { queue, sent } = makeQueue();
    queue.enqueue(mark(1, "warning"));

    const flushing = queue.flush(); // sends "warning"; the result arrives after the next tap
    queue.enqueue(mark(1, "clean"));
    await flushing;

    expect(sent.map((m) => m.status)).toEqual(["warning", "clean"]);
    expect(queue.size).toBe(0);
  });

  it("clientTs strictly increases even when now() is constant", () => {
    const { queue } = makeQueue({ now: () => 5_000 });

    const a = queue.enqueue(mark(1, "warning"));
    const b = queue.enqueue(mark(2, "warning"));
    const c = queue.enqueue(mark(1, "clean"));

    expect([a.clientTs, b.clientTs, c.clientTs]).toEqual([5_000, 5_001, 5_002]);
  });

  it("persists and restores from storage", () => {
    const storage = memoryStorage();
    const first = makeQueue({ storage }).queue;
    first.enqueue(mark(1, "warning"));
    first.enqueue(mark(2, "absent", OTHER_DAY));

    expect(storage.map.has(STORAGE_KEY)).toBe(true);

    const restored = makeQueue({ storage }).queue;
    expect(restored.size).toBe(2);
    expect(restored.pendingFor(DAY)).toEqual([{ ...mark(1, "warning"), clientTs: 1_000 }]);
    expect(restored.pendingFor(OTHER_DAY)).toEqual([{ ...mark(2, "absent", OTHER_DAY), clientTs: 1_001 }]);
    // The restored queue carries on after the newest stored clientTs.
    expect(restored.enqueue(mark(3, "warning")).clientTs).toBe(1_002);
  });

  it("ignores unreadable or malformed storage", () => {
    const storage = memoryStorage();
    storage.setItem(STORAGE_KEY, "{not json");
    expect(makeQueue({ storage }).queue.size).toBe(0);

    storage.setItem(STORAGE_KEY, JSON.stringify([{ lessonId: "x" }, { ...mark(1, "warning"), clientTs: 9 }]));
    const queue = makeQueue({ storage }).queue;
    expect(queue.size).toBe(1);
    expect(queue.pendingFor(DAY)[0].clientTs).toBe(9);
  });

  it("retry uses backoff and keeps the entry", async () => {
    const { queue, send, scheduled } = makeQueue({ results: ["retry", "retry", "ok"] });
    queue.enqueue(mark(1, "warning"));

    await queue.flush();
    expect(queue.size).toBe(1);
    expect(queue.state).toBe("error");
    expect(scheduled.map((s) => s.ms)).toEqual([1_000]);

    scheduled[0].fn();
    await queue.flush();
    expect(queue.size).toBe(1);
    expect(scheduled.map((s) => s.ms)).toEqual([1_000, 2_000]);

    scheduled[1].fn();
    await queue.flush();
    expect(send).toHaveBeenCalledTimes(3);
    expect(queue.size).toBe(0);
    expect(queue.state).toBe("saved");
  });

  it("caps the backoff at 30 s and treats a throwing send as a retry", async () => {
    const storage = memoryStorage();
    const scheduled: number[] = [];
    const queue = new SaveQueue({
      storage,
      send: () => Promise.reject(new Error("boom")),
      now: () => 1_000,
      isOnline: () => true,
      schedule: (_fn, ms) => {
        scheduled.push(ms);
      },
    });
    queue.enqueue(mark(1, "warning"));

    for (let i = 0; i < 7; i++) await queue.flush();

    expect(scheduled).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
    expect(queue.size).toBe(1);
  });

  it("drop removes the entry", async () => {
    const storage = memoryStorage();
    const { queue, send } = makeQueue({ storage, results: ["drop"] });
    queue.enqueue(mark(1, "warning"));

    await queue.flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(0);
    expect(makeQueue({ storage }).queue.size).toBe(0);
  });

  it("pauses on unauthorized and resumes", async () => {
    const { queue, send, sent, scheduled } = makeQueue({ results: ["unauthorized"] });
    queue.enqueue(mark(1, "warning"));

    await queue.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(queue.size).toBe(1);
    expect(scheduled).toEqual([]);

    queue.enqueue(mark(2, "absent"));
    await queue.flush();
    expect(send).toHaveBeenCalledTimes(1); // nothing is sent while paused
    expect(queue.size).toBe(2);

    queue.resume();
    await queue.flush();
    expect(sent.map((m) => m.studentId)).toEqual([1, 1, 2]);
    expect(queue.size).toBe(0);
  });

  it("offline state when isOnline false", async () => {
    const { queue, send, setOnline } = makeQueue();
    setOnline(false);
    queue.enqueue(mark(1, "warning"));

    expect(queue.state).toBe("offline");
    await queue.flush();
    expect(send).not.toHaveBeenCalled();
    expect(queue.size).toBe(1);

    setOnline(true);
    expect(queue.state).toBe("saving");
    await queue.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(queue.state).toBe("saved");
  });

  it("pendingFor filters by date", () => {
    const { queue } = makeQueue();
    queue.enqueue(mark(1, "warning", DAY));
    queue.enqueue(mark(2, "penalty", OTHER_DAY));
    queue.enqueue(mark(3, "absent", DAY, 8));

    expect(queue.pendingFor(DAY).map((m) => m.studentId)).toEqual([1, 3]);
    expect(queue.pendingFor(OTHER_DAY).map((m) => m.studentId)).toEqual([2]);
    expect(queue.pendingFor("2026-10-13")).toEqual([]);
  });
});
