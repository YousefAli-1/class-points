import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router";
import { PinGate } from "../../components/PinGate.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { api } from "../../lib/api.ts";
import { cx } from "../../lib/cx.ts";
import { useAuthStatus } from "../../lib/queries.ts";
import { qk } from "../../lib/queryKeys.ts";
import { AccountTab } from "./AccountTab.tsx";
import { BackupTab } from "./BackupTab.tsx";
import { CalendarTab } from "./CalendarTab.tsx";
import { PointsTab } from "./PointsTab.tsx";
import { StudentsTab } from "./StudentsTab.tsx";
import { SubjectsTab } from "./SubjectsTab.tsx";
import { TabLoading } from "./TabLoading.tsx";

const TABS: { path: string; emoji: string; label: string; element: ReactNode }[] = [
  { path: "students", emoji: "🧒", label: "Students", element: <StudentsTab /> },
  { path: "subjects", emoji: "📚", label: "Subjects", element: <SubjectsTab /> },
  { path: "points", emoji: "⭐", label: "Points", element: <PointsTab /> },
  { path: "calendar", emoji: "🗓️", label: "Calendar", element: <CalendarTab /> },
  { path: "account", emoji: "🔑", label: "Account", element: <AccountTab /> },
  { path: "backup", emoji: "💾", label: "Backup", element: <BackupTab /> },
];

/**
 * Re-checks the auth status when the unlock window ends, so the PIN pad comes back by itself.
 * Each fresh status re-arms it (at least 5 s apart, in case the device clock runs ahead of the server).
 */
function useRelockTimer(adminUntil: number | null, checkedAt: number) {
  const qc = useQueryClient();
  useEffect(() => {
    if (adminUntil === null) return;
    const wait = Math.max(5_000, adminUntil - Date.now() + 500);
    const timer = setTimeout(() => void qc.invalidateQueries({ queryKey: qk.auth }), wait);
    return () => clearTimeout(timer);
  }, [adminUntil, checkedAt, qc]);
}

function TabLink({ path, emoji, label }: { path: string; emoji: string; label: string }) {
  return (
    <NavLink
      to={`/admin/${path}`}
      className={({ isActive }) =>
        cx(
          // Portrait: a row of tabs, emoji over label. Landscape: a sidebar.
          "flex min-h-14 min-w-0 flex-1 select-none flex-col items-center justify-center rounded-2xl px-1 py-1.5",
          "font-display text-base font-semibold whitespace-nowrap",
          "sm:flex-row sm:gap-2 sm:text-lg lg:flex-none lg:justify-start lg:px-4 lg:text-xl",
          isActive ? "chunky bg-forest text-white [--edge:var(--color-forest-deep)]" : "text-forest hover:bg-mint active:bg-mint-deep",
        )
      }
    >
      <span aria-hidden="true" className="text-2xl leading-none">
        {emoji}
      </span>
      {label}
    </NavLink>
  );
}

function UnlockedAdmin() {
  const qc = useQueryClient();
  const lock = useMutation({
    mutationFn: () => api.lock(),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.auth }),
  });

  return (
    <section className="flex flex-col gap-4 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl">Teacher's corner</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sprout-soft px-4 py-1.5 font-display text-lg font-semibold text-leaf-deep">
            <span aria-hidden="true">🔓</span> Unlocked
          </span>
        </div>
        <Button
          variant="secondary"
          icon={<span aria-hidden="true">🔒</span>}
          loading={lock.isPending}
          onClick={() => lock.mutate()}
        >
          Lock
        </Button>
      </header>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <nav aria-label="Admin" className="shrink-0 lg:sticky lg:top-4 lg:w-56">
          <div className="flex gap-1 rounded-blob bg-white/85 p-1.5 shadow-soft ring-1 ring-white backdrop-blur-md lg:flex-col lg:gap-1.5">
            {TABS.map((t) => (
              <TabLink key={t.path} path={t.path} emoji={t.emoji} label={t.label} />
            ))}
          </div>
        </nav>
        <div className="min-w-0 flex-1">
          <Routes>
            <Route index element={<Navigate to="/admin/students" replace />} />
            {TABS.map((t) => (
              <Route key={t.path} path={t.path} element={t.element} />
            ))}
            <Route path="*" element={<Navigate to="/admin/students" replace />} />
          </Routes>
        </div>
      </div>
    </section>
  );
}

/** Admin behind the PIN (spec §8.6): six tabs, a Lock button, and the PIN pad again when it times out. */
export default function AdminPage() {
  const auth = useAuthStatus();
  useRelockTimer(auth.data?.adminUntil ?? null, auth.dataUpdatedAt);

  if (!auth.data) return <TabLoading />;
  if (!auth.data.adminUnlocked) {
    return (
      <section className="py-2 sm:py-6">
        <h1 className="sr-only">Admin</h1>
        <PinGate title="Teacher's corner" subtitle="Enter your PIN" />
      </section>
    );
  }
  return <UnlockedAdmin />;
}
