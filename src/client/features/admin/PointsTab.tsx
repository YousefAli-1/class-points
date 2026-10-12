import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { formatPoints, MAX_POINTS, MIN_POINTS, validatePointValues } from "@shared/rules.ts";
import type { PointValues, Settings } from "@shared/types.ts";
import { AlertIcon } from "../../components/icons.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { Card } from "../../components/ui/Card.tsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.tsx";
import { Stepper } from "../../components/ui/Stepper.tsx";
import { api } from "../../lib/api.ts";
import { useBootstrap } from "../../lib/queries.ts";
import { CardButton, type CardState } from "../day/CardButton.tsx";
import { PointsBadge } from "../day/PointsBadge.tsx";
import { refreshLessonData, useAdminMutation, useSaveSettings } from "./mutations.ts";
import { SaveNote, TabHeader } from "./parts.tsx";
import { TabLoading } from "./TabLoading.tsx";
import { useAutosaveField } from "./useAutosaveField.ts";

type Kind = "clean" | "warning" | "penalty";

const ROWS: { kind: Kind; key: keyof PointValues; label: string }[] = [
  { kind: "clean", key: "pointsClean", label: "No cards" },
  { kind: "warning", key: "pointsWarning", label: "Warning" },
  { kind: "penalty", key: "pointsPenalty", label: "Warning + Penalty" },
];

/** The Warning and Penalty card states a tile shows for each result. */
const CARDS: Record<Kind, [warning: CardState, penalty: CardState]> = {
  clean: ["off", "locked"],
  warning: ["on", "off"],
  penalty: ["on", "on"],
};

const ignore = () => {};

/** What a student tile shows for each result, drawn with the day view's own cards and points sticker. */
function PreviewTile({ kind, label, value }: { kind: Kind; label: string; value: number }) {
  const [warning, penalty] = CARDS[kind];
  return (
    <div
      data-preview={kind}
      className="flex flex-col items-center gap-2 rounded-card border-2 border-line bg-white px-3 pb-4 pt-3 shadow-[0_4px_0_0_var(--color-line-deep)]"
    >
      {/* Only a picture: these card buttons can't be tapped, focused or heard. */}
      <div inert aria-hidden="true" className="grid h-24 w-full max-w-40 grid-cols-2 gap-1">
        <CardButton kind="warning" state={warning} studentName={label} onPress={ignore} />
        <CardButton kind="penalty" state={penalty} studentName={label} onPress={ignore} />
      </div>
      <span className="text-center font-display text-lg font-semibold text-forest">{label}</span>
      <PointsBadge points={value} />
    </div>
  );
}

function PointsEditor({ settings }: { settings: Settings }) {
  const qc = useQueryClient();
  const saveSettings = useSaveSettings();
  const saved: PointValues = {
    pointsClean: settings.pointsClean,
    pointsWarning: settings.pointsWarning,
    pointsPenalty: settings.pointsPenalty,
  };
  const field = useAutosaveField(saved, (v) => saveSettings(v), { validate: validatePointValues });
  const values = field.draft;
  const [confirming, setConfirming] = useState(false);
  const recalculate = useAdminMutation(() => api.recalculate());

  async function updatePastLessons() {
    await field.flush();
    const { updated } = await recalculate.mutateAsync(undefined);
    await refreshLessonData(qc);
    toast.success(updated === 1 ? "1 lesson updated" : `${updated} lessons updated`);
  }

  return (
    <div className="flex flex-col gap-5">
      <TabHeader title="Points" action={<SaveNote status={field.status} />}>
        How many points each result is worth.
      </TabHeader>

      <Card>
        <div className="grid gap-6 sm:grid-cols-3">
          {ROWS.map((row) => (
            <div key={row.key} className="flex flex-col items-center gap-4">
              <Stepper
                label={row.label}
                value={values[row.key]}
                min={MIN_POINTS}
                max={MAX_POINTS}
                format={formatPoints}
                onChange={(n) => field.setDraft({ ...values, [row.key]: n })}
              />
              <div className="w-full max-w-56">
                <PreviewTile kind={row.kind} label={row.label} value={values[row.key]} />
              </div>
            </div>
          ))}
        </div>
        <div aria-live="polite" className="mt-5 min-h-8">
          {field.error && (
            <p className="flex items-start justify-center gap-2 rounded-2xl bg-sunshine-soft px-4 py-3 text-lg font-bold text-honey-deep">
              <AlertIcon size={24} className="mt-0.5 shrink-0" />
              {field.error}
            </p>
          )}
        </div>
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-xl font-semibold text-forest">Applies to lessons started from now on.</p>
          <p className="text-lg text-muted">Lessons already taught keep the points they had.</p>
        </div>
        <Button
          variant="secondary"
          disabled={field.error !== null || field.status === "saving"}
          onClick={() => setConfirming(true)}
        >
          Also update all past lessons
        </Button>
      </Card>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Update all past lessons?"
        description={`Every lesson so far will count No cards ${formatPoints(values.pointsClean)}, Warning ${formatPoints(values.pointsWarning)} and Warning + Penalty ${formatPoints(values.pointsPenalty)}. Reports will change to match.`}
        confirmLabel="Update them"
        onConfirm={updatePastLessons}
      />
    </div>
  );
}

/** Three steppers with live preview tiles and an ordering check (spec §8.6). */
export function PointsTab() {
  const settings = useBootstrap().data?.settings;
  if (!settings) return <TabLoading />;
  return <PointsEditor settings={settings} />;
}
