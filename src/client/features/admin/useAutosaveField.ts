import { useCallback, useEffect, useRef, useState } from "react";
import { friendlyErrorMessage } from "../../lib/queryClient.ts";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export interface AutosaveOptions<T> {
  /** Quiet time after the last change before it saves. */
  delayMs?: number;
  /** A message when `v` can't be saved; it is shown and nothing is sent. */
  validate?(v: T): string | null;
}

export interface AutosaveField<T> {
  draft: T;
  setDraft(v: T): void;
  error: string | null;
  status: AutosaveStatus;
  /** Saves a pending change now (call it on blur). */
  flush(): Promise<void>;
}

/** Values here are small (strings, numbers, a few numbers in an array or object). */
function same(a: unknown, b: unknown): boolean {
  return Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * An editable copy of a saved value that saves itself (spec §8.6): 600 ms after the last change,
 * on `flush()`, and when the field goes away with a change still waiting. Saves run one at a time.
 * While she has unsaved edits, a fresh `value` from the server doesn't overwrite her draft.
 */
export function useAutosaveField<T>(
  value: T,
  save: (v: T) => Promise<unknown>,
  opts: AutosaveOptions<T> = {},
): AutosaveField<T> {
  const { delayMs = 600, validate } = opts;
  const [draft, setDraftState] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [editing, setEditing] = useState(false);
  const [seen, setSeen] = useState(value);

  // A new value from the server replaces the draft, unless she is in the middle of an edit.
  if (!same(seen, value)) {
    setSeen(value);
    if (!editing) setDraftState(value);
  }

  const latest = useRef({ draft: value, saved: value, save, validate });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    latest.current.draft = draft;
    latest.current.save = save;
    latest.current.validate = validate;
  });
  useEffect(() => {
    latest.current.saved = value;
  }, [value]);

  const saveNow = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    timer.current = undefined;
    chain.current = chain.current.then(async () => {
      const { draft: next, saved, save: send, validate: check } = latest.current;
      if (check?.(next)) return;
      if (same(next, saved)) {
        setEditing(false);
        return;
      }
      setStatus("saving");
      try {
        await send(next);
        latest.current.saved = next;
        setError(null);
        setStatus("saved");
        if (same(latest.current.draft, next)) setEditing(false);
      } catch (err) {
        setError(friendlyErrorMessage(err));
        setStatus("error");
      }
    });
    return chain.current;
  }, []);

  const setDraft = useCallback(
    (v: T) => {
      latest.current.draft = v;
      setDraftState(v);
      setEditing(true);
      clearTimeout(timer.current);
      timer.current = undefined;
      const problem = latest.current.validate?.(v) ?? null;
      setError(problem);
      if (problem) {
        setStatus("idle");
        return;
      }
      timer.current = setTimeout(() => void saveNow(), delayMs);
    },
    [delayMs, saveNow],
  );

  // Leaving the tab mid-edit still saves the change.
  useEffect(
    () => () => {
      if (timer.current !== undefined) void saveNow();
    },
    [saveNow],
  );

  return { draft, setDraft, error, status, flush: saveNow };
}
