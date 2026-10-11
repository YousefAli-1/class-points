import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "./api.ts";
import { tooManyTriesMessage } from "./format.ts";
import { qk } from "./queryKeys.ts";

/** `meta` understood by the global error handler. `silent: true` means the caller shows its own error. */
export interface AppMeta extends Record<string, unknown> {
  silent?: boolean;
}

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: AppMeta;
    mutationMeta: AppMeta;
  }
}

/** A short, kind message for a toast. */
export function friendlyErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "NETWORK":
        return "Can't reach Class Points. Check the internet and try again.";
      case "RATE_LIMITED":
        return tooManyTriesMessage(error.retryAfterMs);
      case "INTERNAL":
        return "Something went wrong on our side. Please try again.";
      default:
        return error.message;
    }
  }
  return "Something went wrong. Please try again.";
}

/** Retries once, but never for answers that won't change on a retry (4xx). */
function retryOnce(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export function createQueryClient(): QueryClient {
  const handleError = (error: unknown, meta: AppMeta | undefined) => {
    if (error instanceof ApiError && (error.status === 401 || error.code === "ADMIN_LOCKED")) {
      // The login page or the PIN pad takes over once the auth status refetches.
      void client.invalidateQueries({ queryKey: qk.auth });
      return;
    }
    if (meta?.silent) return;
    const message = friendlyErrorMessage(error);
    toast.error(message, { id: message });
  };

  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => handleError(error, query.meta) }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _result, mutation) => handleError(error, mutation.meta),
    }),
    defaultOptions: {
      queries: { refetchOnWindowFocus: true, retry: retryOnce },
    },
  });
  return client;
}
