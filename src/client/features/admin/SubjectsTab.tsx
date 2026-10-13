import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { COLOR_KEYS, SUBJECT_EMOJIS } from "@shared/palette.ts";
import type { Subject } from "@shared/types.ts";
import { PlusIcon } from "../../components/icons.tsx";
import { Avatar } from "../../components/ui/Avatar.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.tsx";
import { Modal } from "../../components/ui/Modal.tsx";
import { TextField } from "../../components/ui/TextField.tsx";
import { api, type SubjectPatch } from "../../lib/api.ts";
import { friendlyErrorMessage } from "../../lib/queryClient.ts";
import { useBootstrap } from "../../lib/queries.ts";
import { AvatarPicker, LookPicker, type Look } from "./AvatarPicker.tsx";
import { inOrder, patchBootstrap, refreshLessonData, useAdminMutation } from "./mutations.ts";
import { Collapsible, LookButton, NameInput, RowCard, TabHeader } from "./parts.tsx";
import { SortableList } from "./SortableList.tsx";
import { TabLoading } from "./TabLoading.tsx";
import { undoToast } from "./undoToast.ts";

const MAX_NAME = 30;

const bySortOrder = (a: Subject, b: Subject) => a.sortOrder - b.sortOrder || a.id - b.id;

type PatchVars = { id: number; p: SubjectPatch };

function useSubjectPatch(silent: boolean) {
  return useAdminMutation(({ id, p }: PatchVars) => api.patchSubject(id, p), {
    silent,
    optimistic: (qc, { id, p }) =>
      patchBootstrap(qc, (b) => ({ ...b, subjects: b.subjects.map((s) => (s.id === id ? { ...s, ...p } : s)) })),
  });
}

function SubjectRow({ subject, handle, onlyOne }: { subject: Subject; handle: ReactNode; onlyOne: boolean }) {
  const [picking, setPicking] = useState(false);
  const rename = useSubjectPatch(true);
  const update = useSubjectPatch(false);
  const restore = useAdminMutation((id: number) => api.restoreSubject(id));
  const archive = useAdminMutation((id: number) => api.archiveSubject(id), {
    onSuccess: () => undoToast(`${subject.name} moved to Removed subjects`, () => restore.mutate(subject.id)),
  });
  const look = { emoji: subject.emoji, color: subject.color };

  return (
    <RowCard>
      {handle}
      <LookButton {...look} label={`Change the picture for ${subject.name}`} onClick={() => setPicking(true)} />
      <NameInput
        value={subject.name}
        label={`Name of ${subject.name}`}
        maxLength={MAX_NAME}
        save={(name) => rename.mutateAsync({ id: subject.id, p: { name } })}
      />
      <Button
        variant="ghost"
        className="shrink-0 px-4 text-lg"
        disabled={onlyOne}
        title={onlyOne ? "Keep at least one subject" : undefined}
        loading={archive.isPending}
        onClick={() => archive.mutate(subject.id)}
      >
        Remove
      </Button>
      <AvatarPicker
        open={picking}
        onOpenChange={setPicking}
        name={subject.name}
        emojis={SUBJECT_EMOJIS}
        value={look}
        onChange={(l) => update.mutate({ id: subject.id, p: { emoji: l.emoji, color: l.color } })}
      />
    </RowCard>
  );
}

function AddSubjectDialog({ open, onOpenChange, subjects }: { open: boolean; onOpenChange(open: boolean): void; subjects: Subject[] }) {
  const [name, setName] = useState("");
  const [look, setLook] = useState<Look>(() => {
    const used = new Set(subjects.map((s) => s.emoji));
    return {
      emoji: SUBJECT_EMOJIS.find((e) => !used.has(e)) ?? SUBJECT_EMOJIS[0],
      color: COLOR_KEYS[subjects.length % COLOR_KEYS.length],
    };
  });
  const [error, setError] = useState<string>();
  const create = useAdminMutation((b: { name: string } & Look) => api.createSubject({ name: b.name, emoji: b.emoji, color: b.color }), {
    silent: true,
  });

  function close(next: boolean) {
    if (create.isPending) return;
    onOpenChange(next);
    if (!next) {
      setName("");
      setError(undefined);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the subject a name.");
    if (trimmed.length > MAX_NAME) return setError(`Subject names can be up to ${MAX_NAME} characters.`);
    try {
      await create.mutateAsync({ name: trimmed, ...look });
      toast.success(`${look.emoji} ${trimmed} added`);
      close(false);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Add a subject"
      wide
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
        <div className="flex items-end gap-4">
          <Avatar emoji={look.emoji} color={look.color} size="lg" />
          <TextField
            label="Subject name"
            value={name}
            autoFocus
            autoCapitalize="words"
            maxLength={MAX_NAME + 10}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(undefined);
            }}
            error={error}
            className="flex-1"
          />
        </div>
        <LookPicker emojis={SUBJECT_EMOJIS} value={look} onChange={setLook} />
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => close(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} className="sm:min-w-44">
            Add subject
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RemovedSubjects({ subjects }: { subjects: Subject[] }) {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<Subject | null>(null);
  const restore = useAdminMutation((id: number) => api.restoreSubject(id), {
    onSuccess: (s) => toast.success(`${s.emoji} ${s.name} is back`),
  });
  const remove = useAdminMutation((id: number) => api.deleteSubject(id), { onSuccess: () => refreshLessonData(qc) });

  return (
    <Collapsible title={`Removed subjects (${subjects.length})`}>
      <p className="mb-3 px-2 text-base text-muted">
        They still show in reports. A subject can only be deleted forever if it has no lessons.
      </p>
      <ul className="flex flex-col gap-2">
        {subjects.map((s) => (
          <li key={s.id}>
            <RowCard className="flex-wrap bg-mint/60 pl-3 shadow-none">
              <Avatar emoji={s.emoji} color={s.color} dimmed />
              <p className="min-w-0 flex-1 truncate px-1 font-display text-xl font-semibold text-ink">{s.name}</p>
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
        description="This can't be undone."
        confirmLabel="Delete forever"
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
        }}
      />
    </Collapsible>
  );
}

/** Subjects for the day view's menu: the same pattern as students (spec §8.6). */
export function SubjectsTab() {
  const subjects = useBootstrap().data?.subjects;
  const [adding, setAdding] = useState(false);
  // A fresh dialog each time, so it suggests an emoji and colour nobody has yet.
  const [addKey, setAddKey] = useState(0);
  const reorder = useAdminMutation((ids: number[]) => api.reorderSubjects(ids), {
    optimistic: (qc, ids) => patchBootstrap(qc, (b) => ({ ...b, subjects: inOrder(b.subjects, ids) })),
  });

  if (!subjects) return <TabLoading />;
  const sorted = [...subjects].sort(bySortOrder);
  const active = sorted.filter((s) => s.archivedAt === null);
  const removed = sorted.filter((s) => s.archivedAt !== null);

  return (
    <div className="flex flex-col gap-5">
      <TabHeader
        title="Subjects"
        action={
          <Button
            icon={<PlusIcon />}
            onClick={() => {
              setAddKey((k) => k + 1);
              setAdding(true);
            }}
          >
            Add subject
          </Button>
        }
      >
        The order here is the order in the lesson menu.
      </TabHeader>

      <SortableList
        items={active}
        labelOf={(s) => s.name}
        onReorder={(ids) => reorder.mutate([...ids, ...removed.map((s) => s.id)])}
        renderItem={(s, handle) => <SubjectRow subject={s} handle={handle} onlyOne={active.length <= 1} />}
      />

      {removed.length > 0 && <RemovedSubjects subjects={removed} />}

      <AddSubjectDialog key={addKey} open={adding} onOpenChange={setAdding} subjects={subjects} />
    </div>
  );
}
