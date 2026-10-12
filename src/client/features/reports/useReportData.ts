import { useState } from "react";
import type { ISODate, ReportRaw } from "@shared/types.ts";
import { useReportRaw } from "../../lib/queries.ts";

/**
 * `useReportRaw`, but while a new period loads it keeps showing the last report (dimmed by the page)
 * instead of collapsing the podium, chart and table for a moment on every ‹ › tap.
 */
export function useReportData(from: ISODate, to: ISODate, enabled: boolean) {
  const query = useReportRaw(from, to, enabled);
  const [last, setLast] = useState<ReportRaw | undefined>(undefined);
  if (query.data && query.data !== last) setLast(query.data);

  const waiting = enabled && query.isPending && query.fetchStatus !== "idle";
  return {
    data: query.data ?? (waiting ? last : undefined),
    /** Showing the previous period's report while this one loads. */
    stale: !query.data && waiting && last !== undefined,
    loading: waiting && last === undefined,
    error: query.isError ? query.error : null,
    retry: () => void query.refetch(),
  };
}
