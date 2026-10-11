import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { cx } from "../../lib/cx.ts";
import { CloseIcon } from "../icons.tsx";
import { IconButton } from "./IconButton.tsx";
import { OVERLAY_CLASS, PANEL_CLASS } from "./styles.ts";

export interface ModalProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  children: ReactNode;
  /** A wider panel, for forms with two columns or pickers. */
  wide?: boolean;
}

/** A centred dialog with a title, an optional description and a close button. */
export function Modal({ open, onOpenChange, title, description, children, wide = false }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay data-cp-overlay className={OVERLAY_CLASS} />
        <Dialog.Content
          data-cp-dialog
          className={cx(PANEL_CLASS, wide ? "max-w-3xl" : "max-w-lg")}
          // Without a description, tell Radix there is deliberately nothing to describe the dialog.
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <div className="mb-5 flex items-start gap-3">
            <div className="min-w-0 flex-1 pt-2">
              <Dialog.Title className="font-display text-2xl font-semibold text-forest sm:text-[1.75rem]">
                {title}
              </Dialog.Title>
              {description && <Dialog.Description className="mt-1.5 text-lg text-muted">{description}</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={<CloseIcon />} variant="ghost" className="-mr-2 -mt-2" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
