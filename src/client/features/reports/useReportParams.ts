import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { isValidISODate, type Period } from "@shared/dates.ts";
import type { ISODate } from "@shared/types.ts";
import { useToday } from "../../lib/queries.ts";

export interface ReportParamValues {
  period: Period;
  date: ISODate;
  /** `undefined` means every subject. */
  subjectIds: number[] | undefined;
}

export interface ReportParams extends ReportParamValues {
  set(p: Partial<ReportParamValues>): void;
}

const PERIODS: readonly string[] = ["day", "week", "month"] satisfies Period[];

function parsePeriod(raw: string | null): Period {
  return raw && PERIODS.includes(raw) ? (raw as Period) : "week";
}

function parseSubjects(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const ids = raw
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length > 0 ? [...new Set(ids)].sort((a, b) => a - b) : undefined;
}

/**
 * The report's period, anchor date and subject filter, kept in the URL (`period`, `date`, `subjects`)
 * so the class and student reports share them and a reload keeps her place.
 */
export function useReportParams(): ReportParams {
  const [params, setParams] = useSearchParams();
  const today = useToday();

  const period = parsePeriod(params.get("period"));
  const rawDate = params.get("date");
  const date = rawDate && isValidISODate(rawDate) ? rawDate : today;
  const rawSubjects = params.get("subjects");
  const subjectIds = useMemo(() => parseSubjects(rawSubjects), [rawSubjects]);

  const set = useCallback(
    (p: Partial<ReportParamValues>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (p.period) next.set("period", p.period);
          if (p.date) next.set("date", p.date);
          if ("subjectIds" in p) {
            const ids = p.subjectIds && [...new Set(p.subjectIds)].sort((a, b) => a - b);
            if (ids && ids.length > 0) next.set("subjects", ids.join(","));
            else next.delete("subjects");
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { period, date, subjectIds, set };
}
