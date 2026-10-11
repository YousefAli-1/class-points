import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useAuthStatus } from "./queries.ts";
import { SaveQueueContext, createSaveQueueStore } from "./saveQueueContext.ts";

/**
 * Owns the app's mark save queue. Flushes when the network comes back, when the app regains focus and
 * after logging in; a 401 pauses the queue (keeping every tap) until the session is back.
 */
export function SaveQueueProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [store] = useState(() => createSaveQueueStore(qc));
  const loggedIn = useAuthStatus().data?.loggedIn === true;

  useEffect(() => {
    if (loggedIn) store.retryNow();
  }, [loggedIn, store]);

  useEffect(() => {
    const flush = () => {
      store.refresh();
      void store.queue.flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") flush();
    };
    window.addEventListener("online", flush);
    window.addEventListener("offline", store.refresh);
    window.addEventListener("focus", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener("offline", store.refresh);
      window.removeEventListener("focus", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [store]);

  return <SaveQueueContext.Provider value={store}>{children}</SaveQueueContext.Provider>;
}

// The plan's interface exposes the hook from this module.
// eslint-disable-next-line react-refresh/only-export-components
export { useSaveQueue } from "./saveQueueContext.ts";
