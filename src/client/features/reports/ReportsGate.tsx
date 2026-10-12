import type { ReactNode } from "react";
import type { Bootstrap } from "@shared/types.ts";
import { PinGate } from "../../components/PinGate.tsx";
import { useAuthStatus, useBootstrap } from "../../lib/queries.ts";
import { ReportLoadError, ReportLoading } from "./ReportStatus.tsx";

/**
 * The one place the reports access rule lives (spec §8.5): wait for the session and bootstrap,
 * then show the PIN gate while `reportsNeedPin` is on and admin is locked, else render the report.
 */
export function ReportsGate({ children }: { children: (boot: Bootstrap) => ReactNode }) {
  const auth = useAuthStatus();
  const boot = useBootstrap();

  if (!auth.data || !boot.data) {
    return boot.isError ? <ReportLoadError onRetry={() => void boot.refetch()} /> : <ReportLoading />;
  }
  if (boot.data.settings.reportsNeedPin && !auth.data.adminUnlocked) {
    return (
      <section className="flex flex-col gap-4 pt-4">
        <PinGate title="Reports are locked" subtitle="Enter your PIN to see the reports" />
      </section>
    );
  }
  return <>{children(boot.data)}</>;
}
