import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PinGate } from "../../components/PinGate.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { Card } from "../../components/ui/Card.tsx";
import { EmptyState } from "../../components/ui/EmptyState.tsx";
import { api } from "../../lib/api.ts";
import { useAuthStatus } from "../../lib/queries.ts";
import { qk } from "../../lib/queryKeys.ts";

/** Placeholder: Task 8 builds admin (spec §8.6). The PIN gate already works. */
export default function AdminPage() {
  const unlocked = useAuthStatus().data?.adminUnlocked === true;
  const qc = useQueryClient();
  const [locking, setLocking] = useState(false);

  if (!unlocked) {
    return (
      <section className="flex flex-col gap-4 py-2">
        <h1 className="sr-only">Admin</h1>
        <PinGate title="Admin" subtitle="Enter your PIN to open admin." />
      </section>
    );
  }

  async function lock() {
    setLocking(true);
    try {
      await api.lock();
      await qc.invalidateQueries({ queryKey: qk.auth });
    } finally {
      setLocking(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-4xl">Admin</h1>
        <Button variant="secondary" icon={<span aria-hidden="true">🔒</span>} loading={locking} onClick={() => void lock()}>
          Lock
        </Button>
      </div>
      <Card>
        <EmptyState mood="cheer" title="Admin is on its way" />
      </Card>
    </section>
  );
}
