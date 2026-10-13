import { Suspense } from "react";
import { Outlet } from "react-router";
import { Mascot } from "../Mascot.tsx";
import { Spinner } from "../ui/Spinner.tsx";
import { LeafBackdrop } from "./LeafBackdrop.tsx";
import { TopBar } from "./TopBar.tsx";

function PageLoading() {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-leaf-deep">
      <Mascot mood="think" size={96} />
      <Spinner size={30} />
    </div>
  );
}

/**
 * Every signed-in screen: the leaf background, the top bar and the page. A page marked
 * `data-fit-screen` (the day view) gets a column exactly one screen tall to fill (see index.css).
 */
export function AppShell() {
  return (
    <div className="relative flex min-h-dvh flex-col fit-screen:h-svh fit-screen:min-h-svh">
      <LeafBackdrop />
      <TopBar />
      <main className="relative z-10 flex-1 px-safe pb-safe pt-3 sm:pt-4 fit-screen:flex fit-screen:flex-col fit-screen:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-[90rem] fit-screen:flex fit-screen:flex-1 fit-screen:flex-col">
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
