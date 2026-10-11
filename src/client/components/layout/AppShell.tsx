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

/** Every signed-in screen: the leaf background, the top bar and the page. */
export function AppShell() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <LeafBackdrop />
      <TopBar />
      <main className="relative z-10 flex-1 px-safe pb-safe pt-3 sm:pt-4">
        <div className="mx-auto w-full max-w-[90rem]">
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
