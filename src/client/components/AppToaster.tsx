import { Toaster } from "sonner";
import { AlertIcon, CheckIcon } from "./icons.tsx";

const TOAST_ICON = "flex size-8 items-center justify-center rounded-full";

/** The app's toasts: white cards at the top, amber (never red) for errors. */
export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      offset={{ top: "max(16px, env(safe-area-inset-top))" }}
      mobileOffset={{ top: "max(12px, env(safe-area-inset-top))" }}
      gap={10}
      visibleToasts={3}
      icons={{
        success: (
          <span className={`${TOAST_ICON} bg-sprout-soft text-leaf-deep`}>
            <CheckIcon size={20} />
          </span>
        ),
        error: (
          <span className={`${TOAST_ICON} bg-sunshine-soft text-honey-deep`}>
            <AlertIcon size={20} />
          </span>
        ),
        info: <span className={`${TOAST_ICON} bg-mint text-lg`}>🌱</span>,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[min(28rem,calc(100vw-2rem))] items-center gap-3 rounded-[1.25rem] bg-white px-4 py-3 font-body text-base text-ink shadow-pop ring-2 ring-line",
          title: "font-bold leading-snug",
          description: "text-muted",
          error: "ring-sunshine",
          icon: "shrink-0",
          // Unstyled toasts get no button look from sonner: an action (Undo) needs its own, at 56px.
          actionButton:
            "chunky ml-auto inline-flex min-h-14 min-w-14 shrink-0 cursor-pointer select-none items-center justify-center rounded-full bg-forest px-5 font-display text-lg font-bold text-white [--edge:var(--color-forest-deep)]",
        },
      }}
    />
  );
}
