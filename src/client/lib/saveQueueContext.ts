import type { QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { DayResponse, ISODate, Mark, MarkStatus } from "@shared/types.ts";
import { ApiError, api } from "./api.ts";
import { withMarks } from "./dayCache.ts";
import { qk } from "./queryKeys.ts";
import { SaveQueue, type QueuedMark, type SaveState, type SendResult } from "./saveQueue.ts";

// Glue between the framework-free SaveQueue and React: an external store plus the hooks that read it.

export interface SaveQueueSnapshot {
  state: SaveState;
  size: number;
  entries: readonly QueuedMark[];
}

export interface SaveQueueStore {
  queue: SaveQueue;
  subscribe(listener: () => void): () => void;
  getSnapshot(): SaveQueueSnapshot;
  /** Re-reads the queue, e.g. after the network comes or goes. */
  refresh(): void;
  enqueueMark(date: ISODate, lessonId: number, studentId: number, status: MarkStatus): void;
  retryNow(): void;
}

/** Statuses meaning "this mark can never be saved": drop it and reload the day. */
const DROP_STATUSES = new Set([400, 404, 409]);

const EMPTY: SaveQueueSnapshot = { state: "saved", size: 0, entries: [] };

function browserStorage(): Pick<Storage, "getItem" | "setItem"> {
  try {
    const storage = window.localStorage;
    storage.getItem("cp.probe");
    return storage;
  } catch {
    // Storage is blocked (some private modes): keep the queue in memory for this visit.
    const memory = new Map<string, string>();
    return { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) };
  }
}

/** Puts the server's copy of a saved mark into the cached day. */
function applySaved(qc: QueryClient, date: ISODate, saved: Mark | undefined): void {
  const key = qk.day(date);
  // A load of this day that started before the save may answer without it, and the tap is no
  // longer pending to cover for it. Start that load again so the stale answer is thrown away.
  if (qc.getQueryState(key)?.fetchStatus === "fetching") {
    void qc.refetchQueries({ queryKey: key, exact: true }, { cancelRefetch: true });
  }
  // The server keeps the newest write (last write wins), which may be another device's.
  if (saved && typeof saved.status === "string") {
    qc.setQueryData<DayResponse>(key, (day) => day && withMarks(day, [saved]));
  }
}

async function sendMark(qc: QueryClient, m: QueuedMark): Promise<SendResult> {
  try {
    applySaved(qc, m.date, await api.putMark(m.lessonId, m.studentId, m.status, m.clientTs));
    return "ok";
  } catch (error) {
    if (!(error instanceof ApiError)) return "retry";
    if (error.status === 401) {
      void qc.invalidateQueries({ queryKey: qk.auth });
      return "unauthorized";
    }
    if (DROP_STATUSES.has(error.status)) {
      void qc.invalidateQueries({ queryKey: qk.day(m.date) });
      toast.error("One change couldn't be saved, so the latest marks were loaded.", { id: "mark-dropped" });
      return "drop";
    }
    return "retry";
  }
}

export function createSaveQueueStore(
  qc: QueryClient,
  storage: Pick<Storage, "getItem" | "setItem"> = browserStorage(),
): SaveQueueStore {
  const listeners = new Set<() => void>();
  const queue = new SaveQueue({
    storage,
    send: (m) => sendMark(qc, m),
    isOnline: () => navigator.onLine,
    onChange: () => refresh(),
  });
  let snapshot = read();

  function read(): SaveQueueSnapshot {
    return { state: queue.state, size: queue.size, entries: queue.pending() };
  }

  function refresh() {
    snapshot = read();
    for (const listener of listeners) listener();
  }

  return {
    queue,
    refresh,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    enqueueMark(date, lessonId, studentId, status) {
      const entry = queue.enqueue({ date, lessonId, studentId, status });
      qc.setQueryData<DayResponse>(
        qk.day(date),
        (day) => day && withMarks(day, [{ lessonId, studentId, status, updatedAt: entry.clientTs }]),
      );
      void queue.flush();
    },
    retryNow() {
      queue.resume();
      void queue.flush();
    },
  };
}

export const SaveQueueContext = createContext<SaveQueueStore | null>(null);

const noSubscribe = () => () => {};
const emptySnapshot = () => EMPTY;

function useSnapshot(store: SaveQueueStore | null): SaveQueueSnapshot {
  return useSyncExternalStore(store?.subscribe ?? noSubscribe, store?.getSnapshot ?? emptySnapshot);
}

export function useSaveQueue(): {
  enqueueMark(date: ISODate, lessonId: number, studentId: number, status: MarkStatus): void;
  state: SaveState;
  pending: number;
  retryNow(): void;
} {
  const store = useContext(SaveQueueContext);
  if (!store) throw new Error("useSaveQueue must be used inside <SaveQueueProvider>");
  const snapshot = useSnapshot(store);
  return { enqueueMark: store.enqueueMark, state: snapshot.state, pending: snapshot.size, retryNow: store.retryNow };
}

/** Marks for `date` still waiting to reach the server. Empty outside a SaveQueueProvider. */
export function usePendingMarks(date: ISODate): readonly QueuedMark[] {
  const snapshot = useSnapshot(useContext(SaveQueueContext));
  return useMemo(() => snapshot.entries.filter((m) => m.date === date), [snapshot, date]);
}
