import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { todayISO } from "@shared/dates.ts";
import type { BackupFile } from "@shared/types.ts";
import { Mascot } from "../../components/Mascot.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { Card } from "../../components/ui/Card.tsx";
import { api } from "../../lib/api.ts";
import { useBootstrap } from "../../lib/queries.ts";
import { useAdminMutation } from "./mutations.ts";
import { TabHeader } from "./parts.tsx";
import { TabLoading } from "./TabLoading.tsx";

const REMIND_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

/** Saves the backup as a file on this device, through a Blob (no extra request). */
function saveFile(file: BackupFile): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `class-points-backup-${todayISO()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Download a JSON backup; a reminder after 30 days without one (spec §8.6, decision 12). */
export function BackupTab() {
  const lastBackupAt = useBootstrap().data?.settings.lastBackupAt;
  const download = useAdminMutation(() => api.backup(), {
    onSuccess: (file) => {
      saveFile(file);
      toast.success("Backup downloaded. Keep it somewhere safe!");
    },
  });
  // The clock is read once, when the tab opens (render must stay pure).
  const [now] = useState(() => Date.now());

  if (lastBackupAt === undefined) return <TabLoading />;
  const due = lastBackupAt === null || now - lastBackupAt > REMIND_AFTER_MS;

  return (
    <div className="flex flex-col gap-5">
      <TabHeader title="Backup">A copy of everything, saved as a file.</TabHeader>

      {due && (
        <Card className="flex items-center gap-4 bg-sunshine-soft ring-2 ring-sunshine">
          <span aria-hidden="true" className="text-5xl">
            💾
          </span>
          <div className="min-w-0">
            <p className="font-display text-2xl font-semibold text-ink">Time for a backup!</p>
            <p className="text-lg text-honey-deep">
              {lastBackupAt === null
                ? "You haven't downloaded one yet."
                : "Your last download was more than 30 days ago."}{" "}
              It only takes a moment.
            </p>
          </div>
        </Card>
      )}

      <Card className="flex flex-col items-center gap-4 py-8! text-center">
        <Mascot mood={due ? "think" : "cheer"} size={112} />
        <p className="text-xl text-ink">
          Last backup:{" "}
          <strong className="font-display font-semibold">
            {lastBackupAt === null ? "never" : formatDistanceToNow(lastBackupAt, { addSuffix: true })}
          </strong>
        </p>
        <Button size="lg" loading={download.isPending} onClick={() => download.mutate(undefined)}>
          Download backup
        </Button>
        <p className="max-w-xl text-lg text-muted">
          The file has your students, subjects, settings, holidays, lessons and points. Save it to Files or
          email it to yourself.
        </p>
      </Card>

      <Card>
        <h3 className="text-2xl">Made a mistake?</h3>
        <p className="mt-1 text-lg text-muted">
          Class Points can also roll back to any moment in the last 7 days. Ask the person who set up the app
          and tell them roughly when things went wrong. Older than that? A downloaded backup can be restored too.
        </p>
      </Card>
    </div>
  );
}
