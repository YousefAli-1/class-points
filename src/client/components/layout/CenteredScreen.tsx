import type { ReactNode } from "react";
import { LeafBackdrop } from "./LeafBackdrop.tsx";

/** A full-height screen with its content in the middle: login, setup, loading and error screens. */
export function CenteredScreen({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-safe pb-safe pt-safe">
      <LeafBackdrop />
      <main className="relative z-10 flex w-full flex-col items-center py-8">{children}</main>
    </div>
  );
}
