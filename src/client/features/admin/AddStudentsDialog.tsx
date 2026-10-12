import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { todayISO } from "@shared/dates.ts";
import type { ISODate } from "@shared/types.ts";
import { Button } from "../../components/ui/Button.tsx";
import { DateField } from "../../components/ui/DateField.tsx";
import { Field } from "../../components/ui/Field.tsx";
import { Modal } from "../../components/ui/Modal.tsx";
import { INPUT_CLASS, describedBy } from "../../components/ui/styles.ts";
import { api } from "../../lib/api.ts";
import { cx } from "../../lib/cx.ts";
import { friendlyErrorMessage } from "../../lib/queryClient.ts";
import { useSound } from "../../lib/sound.ts";
import { useAdminMutation } from "./mutations.ts";

const MAX_NAME = 40;
const MAX_AT_ONCE = 60;

/** One name per line, trimmed, blank lines skipped. */
function namesIn(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function problemWith(names: string[]): string | undefined {
  const long = names.find((n) => n.length > MAX_NAME);
  if (long) return `“${long.slice(0, 20)}…” is too long. Names can be up to ${MAX_NAME} characters.`;
  if (names.length > MAX_AT_ONCE) return `Add up to ${MAX_AT_ONCE} students at a time.`;
  return undefined;
}

export interface AddStudentsDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

/** Paste or type the class list, one name per line. Avatars and colours are handed out by the server. */
export function AddStudentsDialog({ open, onOpenChange }: AddStudentsDialogProps) {
  const id = useId();
  const play = useSound();
  const [text, setText] = useState("");
  const [from, setFrom] = useState<ISODate>(todayISO);
  const [error, setError] = useState<string>();
  const names = namesIn(text);
  const add = useAdminMutation((b: { names: string[]; activeFrom: ISODate }) => api.createStudents(b.names, b.activeFrom), {
    silent: true,
  });

  function close(next: boolean) {
    if (add.isPending) return;
    onOpenChange(next);
    if (!next) {
      setText("");
      setFrom(todayISO());
      setError(undefined);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = names.length === 0 ? "Type at least one name." : problemWith(names);
    if (problem) {
      setError(problem);
      return;
    }
    try {
      await add.mutateAsync({ names, activeFrom: from });
      play("sparkle");
      toast.success(names.length === 1 ? `${names[0]} joined the class!` : `${names.length} students joined the class!`);
      close(false);
    } catch (err) {
      setError(friendlyErrorMessage(err));
    }
  }

  const count = names.length;
  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Add students"
      description="Type or paste one name per line. Everyone gets their own animal."
    >
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
        <Field
          inputId={id}
          label="Names"
          hint={count > 0 ? `${count} ${count === 1 ? "name" : "names"}` : undefined}
          error={error}
        >
          <textarea
            id={id}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(undefined);
            }}
            rows={8}
            autoFocus
            autoCapitalize="words"
            spellCheck={false}
            placeholder={"Amira\nBen\nChloe"}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy(id, count > 0 ? "hint" : undefined, error)}
            className={cx(INPUT_CLASS, "h-auto min-h-48 resize-y py-3 leading-relaxed")}
          />
        </Field>
        <div className="max-w-64">
          <DateField label="Counts from" value={from} onChange={setFrom} />
        </div>
        <p className="-mt-3 text-base text-muted">They join lessons from this day on. Pick an earlier day to fill in past lessons.</p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => close(false)} disabled={add.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={add.isPending} disabled={count === 0} className="sm:min-w-48">
            {count === 0 ? "Add students" : count === 1 ? "Add 1 student" : `Add ${count} students`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
