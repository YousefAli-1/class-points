import { AlertDialog } from "radix-ui";
import { useState } from "react";
import { cx } from "../../lib/cx.ts";
import { Button } from "./Button.tsx";
import { OVERLAY_CLASS, PANEL_CLASS } from "./styles.ts";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  /** May return a promise: the button spins until it settles, then the dialog closes on success. */
  onConfirm(): void | Promise<void>;
}

/**
 * "Are you sure?" before a destructive or important action. If `onConfirm` throws, the dialog stays
 * open; the error itself is shown by the caller (or by the global toast for failed mutations).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "danger",
  onConfirm,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Stay open so she can try again or cancel.
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay data-cp-overlay className={OVERLAY_CLASS} />
        <AlertDialog.Content data-cp-dialog className={cx(PANEL_CLASS, "max-w-md text-center")}>
          <AlertDialog.Title className="font-display text-[1.75rem] font-semibold text-forest">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-lg text-muted">{description}</AlertDialog.Description>
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={busy} className="sm:min-w-36">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button variant={tone} loading={busy} onClick={() => void confirm()} className="sm:min-w-36">
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
