import type { ISODate, MarkStatus } from "@shared/types.ts";

// The persisted outbox for mark taps (spec §10). Framework-free so it can be unit tested:
// the React side lives in SaveQueueProvider.

export interface QueuedMark {
  lessonId: number;
  studentId: number;
  status: MarkStatus;
  clientTs: number;
  date: ISODate;
}

/** What happened to one send: saved, rejected for good, worth retrying, or the session expired. */
export type SendResult = "ok" | "drop" | "retry" | "unauthorized";

export type SaveState = "saved" | "saving" | "offline" | "error";

export interface SaveQueueOptions {
  storage: Pick<Storage, "getItem" | "setItem">;
  send: (m: QueuedMark) => Promise<SendResult>;
  now?: () => number;
  isOnline?: () => boolean;
  schedule?: (fn: () => void, ms: number) => unknown;
  onChange?: () => void;
}

const STORAGE_KEY = "cp.saveQueue.v1";
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const STATUSES: readonly string[] = ["clean", "warning", "penalty", "absent"];

const keyOf = (m: Pick<QueuedMark, "lessonId" | "studentId">) => `${m.lessonId}:${m.studentId}`;

function isQueuedMark(v: unknown): v is QueuedMark {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    Number.isInteger(m.lessonId) &&
    Number.isInteger(m.studentId) &&
    typeof m.status === "string" &&
    STATUSES.includes(m.status) &&
    typeof m.clientTs === "number" &&
    Number.isFinite(m.clientTs) &&
    typeof m.date === "string"
  );
}

export class SaveQueue {
  /** Newest state per `lessonId:studentId`, oldest first. */
  private readonly entries = new Map<string, QueuedMark>();
  private readonly storage: SaveQueueOptions["storage"];
  private readonly send: SaveQueueOptions["send"];
  private readonly now: () => number;
  private readonly isOnline: () => boolean;
  private readonly schedule: (fn: () => void, ms: number) => unknown;
  private readonly onChange: () => void;

  private lastTs = 0;
  private paused = false;
  private failures = 0;
  /** Only the newest scheduled retry may fire a flush. */
  private retryGeneration = 0;
  private flushing: Promise<void> | null = null;

  constructor(o: SaveQueueOptions) {
    this.storage = o.storage;
    this.send = o.send;
    this.now = o.now ?? Date.now;
    this.isOnline = o.isOnline ?? (() => true);
    this.schedule = o.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    this.onChange = o.onChange ?? (() => {});
    this.restore();
  }

  get size(): number {
    return this.entries.size;
  }

  get state(): SaveState {
    if (!this.isOnline()) return "offline";
    if (this.entries.size === 0) return "saved";
    if (this.failures > 0 || this.paused) return "error";
    return "saving";
  }

  /** Queues the newest state for one student in one lesson, replacing any older pending state. */
  enqueue(m: Omit<QueuedMark, "clientTs">): QueuedMark {
    const clientTs = Math.max(this.now(), this.lastTs + 1);
    this.lastTs = clientTs;
    const entry: QueuedMark = {
      lessonId: m.lessonId,
      studentId: m.studentId,
      status: m.status,
      date: m.date,
      clientTs,
    };
    const key = keyOf(entry);
    this.entries.delete(key); // re-insert so the map stays in tap order
    this.entries.set(key, entry);
    this.persist();
    this.onChange();
    return entry;
  }

  /** Sends everything pending, oldest first. Resolves when the queue is empty or has to wait. */
  flush(): Promise<void> {
    this.flushing ??= this.run().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  pause(): void {
    this.paused = true;
    this.onChange();
  }

  resume(): void {
    this.paused = false;
    this.onChange();
  }

  /** Every pending entry, oldest first. */
  pending(): QueuedMark[] {
    return [...this.entries.values()];
  }

  pendingFor(date: ISODate): QueuedMark[] {
    return this.pending().filter((m) => m.date === date);
  }

  private async run(): Promise<void> {
    // No awaits before the first send: a tap made while it is in flight must find it already sent.
    for (;;) {
      if (this.paused || !this.isOnline()) return;
      const entry = this.entries.values().next().value;
      if (!entry) return;

      let result: SendResult;
      try {
        result = await this.send(entry);
      } catch {
        result = "retry";
      }

      if (result === "ok" || result === "drop") {
        this.failures = 0;
        this.removeIfCurrent(entry);
        this.onChange();
        continue;
      }
      if (result === "unauthorized") {
        this.paused = true;
        this.onChange();
        return;
      }
      this.failures++;
      this.scheduleRetry();
      this.onChange();
      return;
    }
  }

  private scheduleRetry(): void {
    const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (this.failures - 1));
    const generation = ++this.retryGeneration;
    this.schedule(() => {
      if (generation === this.retryGeneration) void this.flush();
    }, delay);
  }

  /** Removes `sent` unless a newer tap for the same key replaced it while it was in flight. */
  private removeIfCurrent(sent: QueuedMark): void {
    const key = keyOf(sent);
    if (this.entries.get(key)?.clientTs !== sent.clientTs) return;
    this.entries.delete(key);
    this.persist();
  }

  private persist(): void {
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify([...this.entries.values()]));
    } catch {
      // Storage can be full or blocked (private browsing). The queue still works in memory.
    }
  }

  private restore(): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.storage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      return;
    }
    if (!Array.isArray(parsed)) return;
    for (const item of parsed) {
      if (!isQueuedMark(item)) continue;
      const entry: QueuedMark = {
        lessonId: item.lessonId,
        studentId: item.studentId,
        status: item.status,
        date: item.date,
        clientTs: item.clientTs,
      };
      this.entries.set(keyOf(entry), entry);
      this.lastTs = Math.max(this.lastTs, entry.clientTs);
    }
  }
}
