import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Bootstrap, Settings } from "@shared/types.ts";
import { api } from "../../lib/api.ts";
import { qk } from "../../lib/queryKeys.ts";

/**
 * After every admin call: reload the class data, and the auth status too, because each admin
 * request slides the 10-minute unlock window (`adminUntil`) on the server.
 */
export function refreshAfterAdmin(qc: QueryClient): Promise<unknown> {
  return Promise.all([qc.invalidateQueries({ queryKey: qk.bootstrap }), qc.invalidateQueries({ queryKey: qk.auth })]);
}

/** Lessons' point snapshots or marks changed: cached days and reports are stale too. */
export function refreshLessonData(qc: QueryClient): Promise<unknown> {
  return Promise.all([qc.invalidateQueries({ queryKey: ["day"] }), qc.invalidateQueries({ queryKey: ["report"] })]);
}

export interface AdminMutationOptions<TVars, TData> {
  /** The caller shows the error itself (inline), so no toast. 401 / locked still re-check auth. */
  silent?: boolean;
  /** Runs before the request, e.g. to show the change straight away. */
  optimistic?(qc: QueryClient, vars: TVars): void;
  onSuccess?(data: TData, vars: TVars): void;
}

/** A mutation for an admin route: errors go to the global handler, and success or not, data reloads. */
export function useAdminMutation<TVars, TData = unknown>(
  mutationFn: (vars: TVars) => Promise<TData>,
  { silent = false, optimistic, onSuccess }: AdminMutationOptions<TVars, TData> = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    meta: { silent },
    onMutate: optimistic
      ? async (vars: TVars) => {
          await qc.cancelQueries({ queryKey: qk.bootstrap });
          optimistic(qc, vars);
        }
      : undefined,
    onSuccess,
    onSettled: () => refreshAfterAdmin(qc),
  });
}

/** Edits the cached bootstrap in place (for optimistic updates). */
export function patchBootstrap(qc: QueryClient, edit: (b: Bootstrap) => Bootstrap): void {
  qc.setQueryData<Bootstrap>(qk.bootstrap, (b) => (b ? edit(b) : b));
}

/** Puts the items in the order of `ids`; anything not listed keeps its place after them. */
export function inOrder<T extends { id: number; sortOrder: number }>(items: T[], ids: number[]): T[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  return items.map((item) => (rank.has(item.id) ? { ...item, sortOrder: rank.get(item.id) ?? 0 } : item));
}

/** `PATCH /settings` with the change shown straight away. Errors are shown by the caller. */
export function useSaveSettings() {
  const mutation = useAdminMutation((p: Partial<Settings>) => api.patchSettings(p), {
    silent: true,
    optimistic: (qc, p) => patchBootstrap(qc, (b) => ({ ...b, settings: { ...b.settings, ...p } })),
  });
  const { mutateAsync } = mutation;
  return useCallback((p: Partial<Settings>) => mutateAsync(p), [mutateAsync]);
}
