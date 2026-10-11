import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { RouterProvider } from "react-router/dom";
import { Toaster } from "sonner";
import { AlertIcon, CheckIcon } from "./components/icons.tsx";
import { SaveQueueProvider } from "./lib/SaveQueueProvider.tsx";
import { createQueryClient } from "./lib/queryClient.ts";
import { router } from "./router.tsx";

const queryClient = createQueryClient();

const TOAST_ICON = "flex size-8 items-center justify-center rounded-full";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Motion animations honour the device's reduced-motion setting: only colour changes play. */}
      <MotionConfig reducedMotion="user">
        <SaveQueueProvider>
          <RouterProvider router={router} />
        </SaveQueueProvider>
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
            },
          }}
        />
      </MotionConfig>
    </QueryClientProvider>
  );
}
