// Small display helpers shared by screens.

export function greeting(now: Date = new Date()): "Good morning" | "Good afternoon" | "Good evening" {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "Too many tries, wait 5 min" for a rate-limited login, PIN or reset. */
export function tooManyTriesMessage(retryAfterMs?: number): string {
  if (!retryAfterMs || retryAfterMs <= 0) return "Too many tries, wait a few minutes";
  return `Too many tries, wait ${Math.max(1, Math.ceil(retryAfterMs / 60_000))} min`;
}

/** "4:05" for a countdown in milliseconds (rounded up to the second). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
