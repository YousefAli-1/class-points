import { useId, useState, type ReactNode } from "react";
import type { ColorKey } from "@shared/palette.ts";
import { AlertIcon, CheckIcon, ChevronDownIcon } from "../../components/icons.tsx";
import { Avatar } from "../../components/ui/Avatar.tsx";
import { Spinner } from "../../components/ui/Spinner.tsx";
import { cx } from "../../lib/cx.ts";
import { useAutosaveField, type AutosaveStatus } from "./useAutosaveField.ts";

// Small pieces shared by the admin tabs.

/** A tab's title, a short line under it, and its main action on the right. */
export function TabHeader({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-3xl">{title}</h2>
        {children && <p className="mt-1 text-lg text-muted">{children}</p>}
      </div>
      {action}
    </div>
  );
}

/** "Saving…" / "Saved" next to a field that saves itself. Errors are shown by the field. */
export function SaveNote({ status, className }: { status: AutosaveStatus; className?: string }) {
  return (
    <span aria-live="polite" className={cx("inline-flex min-h-6 items-center gap-1 text-base font-bold", className)}>
      {status === "saving" && (
        <span className="inline-flex items-center gap-1.5 text-muted">
          <Spinner size={16} /> Saving…
        </span>
      )}
      {status === "saved" && (
        <span className="inline-flex items-center gap-1 text-leaf-deep motion-safe:animate-fade-in">
          <CheckIcon size={18} /> Saved
        </span>
      )}
    </span>
  );
}

/** A heading button that shows or hides what is under it (closed to start with). */
export function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="rounded-card bg-white/70 ring-1 ring-line/70">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-14 w-full items-center gap-3 rounded-card px-5 text-left font-display text-xl font-semibold text-forest hover:bg-mint/70"
        >
          <ChevronDownIcon size={24} className={cx("shrink-0 transition-transform", !open && "-rotate-90")} />
          {title}
        </button>
      </h3>
      {open && (
        <div id={id} className="px-3 pb-3 sm:px-4 sm:pb-4">
          {children}
        </div>
      )}
    </section>
  );
}

/** The emoji-on-a-circle as a button that opens the look picker. */
export function LookButton({ emoji, color, label, onClick }: { emoji: string; color: ColorKey; label: string; onClick(): void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex shrink-0 rounded-full p-0.5 transition-transform hover:scale-105 active:scale-95"
    >
      <Avatar emoji={emoji} color={color} />
    </button>
  );
}

export interface NameInputProps {
  value: string;
  /** Read out by screen readers, e.g. "Name of Amira". */
  label: string;
  maxLength: number;
  save(name: string): Promise<unknown>;
}

function nameProblem(name: string, max: number): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a name.";
  if (trimmed.length > max) return `Names can be up to ${max} characters.`;
  return null;
}

/** A name that looks like text until tapped, then edits in place and saves itself. */
export function NameInput({ value, label, maxLength, save }: NameInputProps) {
  const id = useId();
  const field = useAutosaveField(value, (v) => save(v.trim()), { validate: (v) => nameProblem(v, maxLength) });
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <input
          id={id}
          value={field.draft}
          onChange={(e) => field.setDraft(e.target.value)}
          onBlur={() => void field.flush()}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          aria-label={label}
          aria-invalid={field.error ? true : undefined}
          aria-describedby={field.error ? `${id}-error` : undefined}
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="done"
          className={cx(
            "h-14 w-full min-w-0 rounded-2xl border-2 border-transparent bg-transparent px-3 font-display text-xl font-semibold text-ink",
            "transition-colors hover:border-line focus:border-leaf focus:bg-white focus:ring-4 focus:ring-sprout/45 focus-visible:outline-none",
            "aria-[invalid=true]:border-honey aria-[invalid=true]:bg-white",
          )}
        />
        <SaveNote status={field.status} className="hidden w-24 shrink-0 md:inline-flex" />
      </div>
      {field.error && (
        <p id={`${id}-error`} className="mt-1 flex items-center gap-1.5 px-3 text-base font-bold text-honey-deep">
          <AlertIcon size={18} className="shrink-0" />
          {field.error}
        </p>
      )}
    </div>
  );
}

/** One row of a list: a white card. */
export function RowCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-center gap-2 rounded-card bg-white p-2 pr-3 shadow-soft ring-1 ring-line/70", className)}>
      {children}
    </div>
  );
}
