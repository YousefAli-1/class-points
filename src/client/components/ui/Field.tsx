import type { ReactNode } from "react";
import { cx } from "../../lib/cx.ts";
import { AlertIcon } from "../icons.tsx";

export interface FieldProps {
  /** The id of the control inside; the hint and error get `${inputId}-hint` / `-error` (see `describedBy`). */
  inputId: string;
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

/** Label above, control, then a hint or a friendly error (amber, never red: red is for the cards). */
export function Field({ inputId, label, hint, error, className, children }: FieldProps) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={inputId} className="font-display text-lg font-semibold text-forest">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${inputId}-hint`} className="text-base text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} className="flex items-start gap-1.5 text-base font-bold text-honey-deep">
          <AlertIcon size={20} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
