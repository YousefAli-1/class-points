import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { isValidISODate, todayISO } from "@shared/dates.ts";
import { AVATARS } from "@shared/palette.ts";
import type { Student } from "@shared/types.ts";
import { PlusIcon } from "../../components/icons.tsx";
import { Avatar } from "../../components/ui/Avatar.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { Card } from "../../components/ui/Card.tsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.tsx";
import { EmptyState } from "../../components/ui/EmptyState.tsx";
import { INPUT_CLASS } from "../../components/ui/styles.ts";
import { api, type StudentPatch } from "../../lib/api.ts";
import { cx } from "../../lib/cx.ts";
import { useBootstrap } from "../../lib/queries.ts";
import { AddStudentsDialog } from "./AddStudentsDialog.tsx";
import { AvatarPicker } from "./AvatarPicker.tsx";
import { inOrder, patchBootstrap, refreshLessonData, useAdminMutation } from "./mutations.ts";
import { Collapsible, LookButton, NameInput, RowCard, TabHeader } from "./parts.tsx";
import { SortableList } from "./SortableList.tsx";
import { TabLoading } from "./TabLoading.tsx";

const MAX_ACTIVE = 60;

const bySortOrder = (a: Student, b: Student) => a.sortOrder - b.sortOrder || a.id - b.id;

/** "12 Oct 2026" for an archive date. */
function shortDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type PatchVars = { id: number; p: StudentPatch };

/** Edits a student, showing the change straight away. `silent` leaves the error to the caller. */
function useStudentPatch(silent: boolean) {
  return useAdminMutation(({ id, p }: PatchVars) => api.patchStudent(id, p), {
    silent,
    optimistic: (qc, { id, p }) =>
      patchBootstrap(qc, (b) => ({ ...b, students: b.students.map((s) => (s.id === id ? { ...s, ...p } : s)) })),
  });
}

function StudentRow({ student, handle, taken }: { student: Student; handle: ReactNode; taken: ReadonlySet<string> }) {
  const [picking, setPicking] = useState(false);
  const rename = useStudentPatch(true);
  const update = useStudentPatch(false);
  const restore = useAdminMutation((id: number) => api.restoreStudent(id));
  const archive = useAdminMutation((id: number) => api.archiveStudent(id, todayISO()), {
    onSuccess: () =>
      toast(`${student.name} moved to Removed students`, {
        action: { label: "Undo", onClick: () => restore.mutate(student.id) },
      }),
  });
  const look = { emoji: student.avatar, color: student.color };

  return (
    <RowCard className="flex-wrap sm:flex-nowrap">
      {handle}
      <LookButton {...look} label={`Change ${student.name}'s picture`} onClick={() => setPicking(true)} />
      <NameInput
        value={student.name}
        label={`Name of ${student.name}`}
        maxLength={40}
        save={(name) => rename.mutateAsync({ id: student.id, p: { name } })}
      />
      <label className="flex shrink-0 flex-col pl-16 sm:pl-0">
        <span className="px-1 text-sm font-bold text-muted">Counts from</span>
        <input
          type="date"
          required
          value={student.activeFrom}
          onChange={(e) => {
            const d = e.target.value;
            if (isValidISODate(d) && d !== student.activeFrom) update.mutate({ id: student.id, p: { activeFrom: d } });
          }}
          className={cx(INPUT_CLASS, "h-12 w-44 appearance-none px-3 font-display text-base font-semibold")}
        />
      </label>
      <Button
        variant="ghost"
        className="ml-auto shrink-0 px-4 text-lg"
        loading={archive.isPending}
        onClick={() => archive.mutate(student.id)}
      >
        Remove
      </Button>
      <AvatarPicker
        open={picking}
        onOpenChange={setPicking}
        name={student.name}
        emojis={AVATARS}
        taken={taken}
        value={look}
        onChange={(l) => update.mutate({ id: student.id, p: { avatar: l.emoji, color: l.color } })}
      />
    </RowCard>
  );
}

function RemovedStudents({ students }: { students: Student[] }) {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<Student | null>(null);
  const restore = useAdminMutation((id: number) => api.restoreStudent(id), {
    onSuccess: (s) => toast.success(`${s.name} is back in the class`),
  });
  const remove = useAdminMutation((id: number) => api.deleteStudent(id), { onSuccess: () => refreshLessonData(qc) });

  return (
    <Collapsible title={`Removed students (${students.length})`}>
      <p className="mb-3 px-2 text-base text-muted">Their points stay in reports. Restore anyone who comes back.</p>
      <ul className="flex flex-col gap-2">
        {students.map((s) => (
          <li key={s.id}>
            <RowCard className="flex-wrap bg-mint/60 pl-3 shadow-none">
              <Avatar emoji={s.avatar} color={s.color} dimmed />
              <div className="min-w-0 flex-1 px-1">
                <p className="truncate font-display text-xl font-semibold text-ink">{s.name}</p>
                {s.archivedAt && <p className="text-base text-muted">Removed {shortDate(s.archivedAt)}</p>}
              </div>
              <Button
                variant="secondary"
                loading={restore.isPending && restore.variables === s.id}
                onClick={() => restore.mutate(s.id)}
              >
                Restore
              </Button>
              <Button variant="ghost" className="text-honey-deep" onClick={() => setDeleting(s)}>
                Delete forever
              </Button>
            </RowCard>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? ""} forever?`}
        description="Their points in every lesson go too. This can't be undone."
        confirmLabel="Delete forever"
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </Collapsible>
  );
}

/** The class list: rename, pick a look, set "Counts from", drag to reorder, remove and restore (spec §8.6). */
export function StudentsTab() {
  const students = useBootstrap().data?.students;
  const [adding, setAdding] = useState(false);
  const reorder = useAdminMutation((ids: number[]) => api.reorderStudents(ids), {
    optimistic: (qc, ids) => patchBootstrap(qc, (b) => ({ ...b, students: inOrder(b.students, ids) })),
  });

  if (!students) return <TabLoading />;
  const sorted = [...students].sort(bySortOrder);
  const active = sorted.filter((s) => s.archivedAt === null);
  const removed = sorted.filter((s) => s.archivedAt !== null);

  const addButton = (
    <Button icon={<PlusIcon />} onClick={() => setAdding(true)} disabled={active.length >= MAX_ACTIVE}>
      Add students
    </Button>
  );

  return (
    <div className="flex flex-col gap-5">
      <TabHeader title="Students" action={active.length > 0 && addButton}>
        {active.length === 0
          ? "Nobody here yet."
          : `${active.length} in the class${active.length >= MAX_ACTIVE ? " (that's the most a class can have)" : ""}. Drag the dots to change the order.`}
      </TabHeader>

      {active.length === 0 ? (
        <Card>
          <EmptyState mood="wave" title="Let's add your class!" action={addButton}>
            Paste the whole class list at once, one name per line.
          </EmptyState>
        </Card>
      ) : (
        <SortableList
          items={active}
          labelOf={(s) => s.name}
          // Removed students keep their places after the class, so restoring someone doesn't jumble the order.
          onReorder={(ids) => reorder.mutate([...ids, ...removed.map((s) => s.id)])}
          renderItem={(s, handle) => (
            <StudentRow
              student={s}
              handle={handle}
              taken={new Set(active.filter((o) => o.id !== s.id).map((o) => o.avatar))}
            />
          )}
        />
      )}

      {removed.length > 0 && <RemovedStudents students={removed} />}

      <AddStudentsDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
