import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { ConfirmDialog, IconButton } from "../../components/ui/index.ts";
import type { DayCounts } from "./useDayModel.ts";

export interface DayFooterProps {
  counts: DayCounts;
  subjectName: string;
  onCancelLesson(): Promise<void>;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function MoreIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
      <circle cx="5" cy="12" r="2.3" />
      <circle cx="12" cy="12" r="2.3" />
      <circle cx="19" cy="12" r="2.3" />
    </svg>
  );
}

/** The lesson's tally (⭐ · 🟥 · 🟥🟥 · 🏠) and the ⋯ menu with "Cancel this lesson". */
export function DayFooter({ counts, subjectName, onCancelLesson }: DayFooterProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <footer
      data-print-hide
      // Sticky on a phone, where the page scrolls. From iPad width up it sits under the grid, which
      // fills the rest of the screen, so it can never cover a tile.
      className="sticky bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-30 flex min-h-14 items-center gap-2 rounded-blob bg-white/90 pl-4 pr-0.5 shadow-soft ring-1 ring-white backdrop-blur-md md:static"
    >
      <ul
        aria-label="Lesson so far"
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-0.5 font-display text-base font-semibold text-forest sm:gap-x-6 sm:text-xl"
      >
        <li>
          <span aria-hidden="true">⭐ </span>
          {counts.clean}
          <span className="sr-only"> with no cards</span>
        </li>
        <li>
          <span aria-hidden="true">🟥 </span>
          {plural(counts.warnings, "warning", "warnings")}
        </li>
        <li>
          <span aria-hidden="true">🟥🟥 </span>
          {plural(counts.penalties, "penalty", "penalties")}
        </li>
        <li>
          <span aria-hidden="true">🏠 </span>
          {counts.absent} absent
        </li>
      </ul>

      {/* Not modal, so the confirm dialog can take focus cleanly once the menu closes. */}
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <IconButton label="More lesson options" icon={<MoreIcon />} variant="ghost" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            data-cp-popover
            side="top"
            align="end"
            sideOffset={10}
            collisionPadding={16}
            className="z-50 min-w-60 rounded-card bg-white p-2 shadow-pop ring-1 ring-line"
          >
            <DropdownMenu.Item
              onSelect={() => setConfirming(true)}
              className="flex min-h-14 cursor-pointer select-none items-center gap-3 rounded-2xl px-3 font-display text-xl font-semibold text-honey-deep outline-none data-[highlighted]:bg-sunshine-soft"
            >
              <span aria-hidden="true">🗑️</span>
              Cancel this lesson
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Cancel this lesson?"
        description={`The ${subjectName} lesson and all of its cards for this day will be removed.`}
        confirmLabel="Yes, cancel it"
        tone="danger"
        onConfirm={onCancelLesson}
      />
    </footer>
  );
}
