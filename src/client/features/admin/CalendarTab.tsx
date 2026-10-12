import { format } from "date-fns";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { daysBetween, parseISODate } from "@shared/dates.ts";
import { holidayCreateSchema } from "@shared/schemas.ts";
import type { Holiday, ISODate, Settings } from "@shared/types.ts";
import { AlertIcon, PlusIcon } from "../../components/icons.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { Card } from "../../components/ui/Card.tsx";
import { Chip } from "../../components/ui/Chip.tsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.tsx";
import { DateField } from "../../components/ui/DateField.tsx";
import { TextField } from "../../components/ui/TextField.tsx";
import { api } from "../../lib/api.ts";
import { friendlyErrorMessage } from "../../lib/queryClient.ts";
import { useBootstrap, useToday } from "../../lib/queries.ts";
import { useAdminMutation, useSaveSettings } from "./mutations.ts";
import { Collapsible, RowCard, SaveNote, TabHeader } from "./parts.tsx";
import { TabLoading } from "./TabLoading.tsx";
import { useAutosaveField } from "./useAutosaveField.ts";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function SchoolDays({ settings }: { settings: Settings }) {
  const saveSettings = useSaveSettings();
  const field = useAutosaveField(settings.schoolDays, (schoolDays) => saveSettings({ schoolDays }), {
    validate: (days) => (days.length === 0 ? "Pick at least one school day." : null),
  });

  function toggle(day: number) {
    const days = field.draft;
    field.setDraft(days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b));
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-2xl">School days</h3>
        <SaveNote status={field.status} />
      </div>
      <div role="group" aria-label="School days" className="grid grid-cols-4 gap-2 sm:grid-cols-7 [&>*]:px-0">
        {WEEKDAYS.map((label, day) => (
          <Chip key={label} selected={field.draft.includes(day)} onClick={() => toggle(day)}>
            {label}
          </Chip>
        ))}
      </div>
      <div aria-live="polite">
        {field.error && (
          <p className="mt-3 flex items-center gap-2 text-lg font-bold text-honey-deep">
            <AlertIcon size={22} className="shrink-0" />
            {field.error}
          </p>
        )}
      </div>
    </Card>
  );
}

/** "Mon 20 Oct – Fri 24 Oct 2026", or one day. The year shows once, at the end. */
function rangeText(h: Holiday): string {
  const start = parseISODate(h.startDate);
  const end = parseISODate(h.endDate);
  if (h.startDate === h.endDate) return format(start, "EEE d MMM yyyy");
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${format(start, sameYear ? "EEE d MMM" : "EEE d MMM yyyy")} – ${format(end, "EEE d MMM yyyy")}`;
}

function HolidayRow({ holiday, today, onDelete }: { holiday: Holiday; today: ISODate; onDelete(): void }) {
  const days = daysBetween(holiday.startDate, holiday.endDate) + 1;
  const now = holiday.startDate <= today && today <= holiday.endDate;
  return (
    <RowCard className="flex-wrap pl-3">
      <span aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full bg-sunshine-soft text-3xl">
        🏖️
      </span>
      <div className="min-w-0 flex-1 px-1">
        <p className="flex flex-wrap items-center gap-2 font-display text-xl font-semibold text-ink">
          <span className="truncate">{holiday.label}</span>
          {now && <span className="rounded-full bg-sunshine px-3 py-0.5 text-base text-ink">On now</span>}
        </p>
        <p className="text-base text-muted">
          {rangeText(holiday)} · {days === 1 ? "1 day" : `${days} days`}
        </p>
      </div>
      <Button variant="ghost" className="text-honey-deep" onClick={onDelete}>
        Delete
      </Button>
    </RowCard>
  );
}

type HolidayErrors = Partial<Record<"label" | "endDate" | "form", string>>;

function AddHolidayForm({ today }: { today: ISODate }) {
  const [label, setLabel] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [errors, setErrors] = useState<HolidayErrors>({});
  const create = useAdminMutation((b: { startDate: ISODate; endDate: ISODate; label: string }) => api.createHoliday(b), {
    silent: true,
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = holidayCreateSchema.safeParse({ label, startDate, endDate });
    if (!parsed.success) {
      const next: HolidayErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === "label" || issue.path[0] === "endDate" ? issue.path[0] : "form";
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    try {
      await create.mutateAsync(parsed.data);
      toast.success(`${parsed.data.label} added 🏖️`);
      setLabel("");
      setErrors({});
    } catch (err) {
      setErrors({ form: friendlyErrorMessage(err) });
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4 rounded-card bg-mint p-4 sm:p-5">
      <h4 className="font-display text-xl font-semibold text-forest">Add a holiday</h4>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <TextField
          label="Name"
          placeholder="Winter break"
          value={label}
          maxLength={50}
          onChange={(e) => {
            setLabel(e.target.value);
            if (errors.label) setErrors({ ...errors, label: undefined });
          }}
          error={errors.label}
        />
        <DateField
          label="First day"
          value={startDate}
          onChange={(d) => {
            setStartDate(d);
            if (endDate < d) setEndDate(d);
          }}
        />
        <div>
          <DateField
            label="Last day"
            value={endDate}
            onChange={(d) => {
              setEndDate(d);
              if (errors.endDate) setErrors({ ...errors, endDate: undefined });
            }}
          />
          {errors.endDate && (
            <p className="mt-1.5 flex items-start gap-1.5 text-base font-bold text-honey-deep">
              <AlertIcon size={20} className="mt-0.5 shrink-0" />
              {errors.endDate}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {errors.form && (
          <p className="flex flex-1 items-center gap-1.5 text-base font-bold text-honey-deep">
            <AlertIcon size={20} className="shrink-0" />
            {errors.form}
          </p>
        )}
        <Button type="submit" icon={<PlusIcon />} loading={create.isPending}>
          Add holiday
        </Button>
      </div>
    </form>
  );
}

function Holidays({ holidays }: { holidays: Holiday[] }) {
  const today = useToday();
  const [deleting, setDeleting] = useState<Holiday | null>(null);
  const remove = useAdminMutation((id: number) => api.deleteHoliday(id));
  const sorted = [...holidays].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id);
  const upcoming = sorted.filter((h) => h.endDate >= today);
  const past = sorted.filter((h) => h.endDate < today);
  const row = (h: Holiday) => (
    <li key={h.id}>
      <HolidayRow holiday={h} today={today} onDelete={() => setDeleting(h)} />
    </li>
  );

  return (
    <Card className="flex flex-col gap-4">
      <h3 className="text-2xl">Holidays</h3>
      <AddHolidayForm today={today} />
      {upcoming.length > 0 ? (
        <ul className="flex flex-col gap-2">{upcoming.map(row)}</ul>
      ) : (
        <p className="px-1 text-lg text-muted">No holidays coming up.</p>
      )}
      {past.length > 0 && (
        <Collapsible title={`Past (${past.length})`}>
          <ul className="flex flex-col gap-2">{past.map(row)}</ul>
        </Collapsible>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.label ?? "this holiday"}?`}
        description="Those days go back to being school days."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </Card>
  );
}

/** School days and holidays (spec §8.6). */
export function CalendarTab() {
  const data = useBootstrap().data;
  if (!data) return <TabLoading />;
  return (
    <div className="flex flex-col gap-5">
      <TabHeader title="School calendar">Which days are school days, and when the holidays are.</TabHeader>
      <SchoolDays settings={data.settings} />
      <Holidays holidays={data.holidays} />
    </div>
  );
}
