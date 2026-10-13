// The report views (period and subject filter) whose podium already got its confetti in this tab, so
// it plays once per view: not on every visit, ‹ › round trip or reload. Kept in sessionStorage when
// that works (it can throw in private mode or with blocked site data), and in memory as well.

const STORAGE_KEY = "class-points:podium-cheered";
/** Plenty for one session; the oldest views drop off first. */
const MAX_VIEWS = 100;
const seen = new Set<string>();

function stored(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

/** True the first time `view` is asked about in this tab, false every time after. */
export function firstShowing(view: string): boolean {
  const views = stored();
  if (seen.has(view) || views.includes(view)) return false;
  seen.add(view);
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...views, view].slice(-MAX_VIEWS)));
  } catch {
    // Storage is unavailable: `seen` still covers this page load.
  }
  return true;
}
