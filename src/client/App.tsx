import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { RouterProvider } from "react-router/dom";
import { AppToaster } from "./components/AppToaster.tsx";
import { SaveQueueProvider } from "./lib/SaveQueueProvider.tsx";
import { createQueryClient } from "./lib/queryClient.ts";
import { router } from "./router.tsx";

const queryClient = createQueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Motion animations honour the device's reduced-motion setting: only colour changes play. */}
      <MotionConfig reducedMotion="user">
        <SaveQueueProvider>
          <RouterProvider router={router} />
        </SaveQueueProvider>
        <AppToaster />
      </MotionConfig>
    </QueryClientProvider>
  );
}
