import { useState } from "react";
import type { DayKind } from "@shared/dates.ts";
import type { Subject } from "@shared/types.ts";
import { Mascot } from "../../components/Mascot.tsx";
import { Button, Card, ConfirmDialog } from "../../components/ui/index.ts";

export interface StartLessonPanelProps {
  subject: Subject;
  kind: DayKind;
  holidayLabel: string | null;
  isToday: boolean;
  studentCount: number;
  onStart(): Promise<void>;
}

/** "▶ Start English lesson", with a note (and a check) on holidays and days off. */
export function StartLessonPanel({ subject, kind, holidayLabel, isToday, studentCount, onStart }: StartLessonPanelProps) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const dayOff = kind === "off" || kind === "holiday";

  async function start() {
    setBusy(true);
    try {
      await onStart();
    } finally {
      setBusy(false);
    }
  }

  function tap() {
    if (dayOff) setConfirming(true);
    else start().catch(() => {}); // the toast for a failed start comes from the query client
  }

  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-8 text-center sm:py-10">
      <Mascot mood="wave" size={150} />
      <h2 className="text-[1.75rem] sm:text-[2rem]">
        Ready for {subject.emoji} {subject.name}?
      </h2>

      {dayOff && (
        <p className="rounded-full bg-sunshine-soft px-5 py-2 text-lg font-semibold text-honey-deep ring-2 ring-sunshine">
          <span aria-hidden="true">{kind === "holiday" ? "🏖️ " : "🛋️ "}</span>
          {kind === "holiday" ? `Holiday${holidayLabel ? `: ${holidayLabel}` : ""}` : "This is a day off"}
        </p>
      )}

      <Button
        size="xl"
        icon={<span className="text-[1.4rem] leading-none">▶</span>}
        loading={busy && !confirming}
        onClick={tap}
        className="mt-2"
      >
        Start {subject.name} lesson
      </Button>

      {studentCount === 0 && (
        <p className="max-w-md text-lg text-muted">There are no students on this day yet. Add them in Admin.</p>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={isToday ? "Today is a day off." : "This is a day off."}
        description="Start a lesson anyway?"
        confirmLabel="Start lesson"
        tone="primary"
        onConfirm={start}
      />
    </Card>
  );
}
