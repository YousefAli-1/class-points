import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { todayISO } from "@shared/dates.ts";
import type { AuthStatus, Bootstrap, CalendarResponse, DayResponse, ISODate, ReportRaw } from "@shared/types.ts";
import { api } from "./api.ts";
import { withMarks } from "./dayCache.ts";
import { qk } from "./queryKeys.ts";
import { usePendingMarks } from "./saveQueueContext.ts";

export function useAuthStatus(): UseQueryResult<AuthStatus> {
  return useQuery({ queryKey: qk.auth, queryFn: () => api.authStatus() });
}

export function useBootstrap(): UseQueryResult<Bootstrap> {
  return useQuery({ queryKey: qk.bootstrap, queryFn: () => api.bootstrap(), staleTime: 60_000 });
}

/** The day from the server, with taps that are still waiting in the save queue laid on top. */
export function useDay(date: ISODate): UseQueryResult<DayResponse> {
  const pending = usePendingMarks(date);
  const select = useCallback(
    (day: DayResponse) =>
      withMarks(
        day,
        pending.map((m) => ({ lessonId: m.lessonId, studentId: m.studentId, status: m.status, updatedAt: m.clientTs })),
      ),
    [pending],
  );
  return useQuery({ queryKey: qk.day(date), queryFn: () => api.day(date), select });
}

export function useCalendar(month: string): UseQueryResult<CalendarResponse> {
  return useQuery({ queryKey: qk.calendar(month), queryFn: () => api.calendar(month) });
}

export function useReportRaw(from: ISODate, to: ISODate, enabled = true): UseQueryResult<ReportRaw> {
  return useQuery({ queryKey: qk.report(from, to), queryFn: () => api.reportRaw(from, to), enabled });
}

/** The device's local date. Re-renders at local midnight and whenever the app comes back into view. */
export function useToday(): ISODate {
  const [today, setToday] = useState(todayISO);

  useEffect(() => {
    const update = () => setToday(todayISO());
    let timer: ReturnType<typeof setTimeout>;
    const armForMidnight = () => {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(() => {
        update();
        armForMidnight();
      }, midnight.getTime() - now.getTime() + 500);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") update();
    };

    armForMidnight();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return today;
}
