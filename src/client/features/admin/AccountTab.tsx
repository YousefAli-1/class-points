import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { classNameSchema, passwordSchema, personNameSchema, pinSchema } from "@shared/schemas.ts";
import type { Settings } from "@shared/types.ts";
import { Button } from "../../components/ui/Button.tsx";
import { Card } from "../../components/ui/Card.tsx";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog.tsx";
import { TextField } from "../../components/ui/TextField.tsx";
import { Toggle } from "../../components/ui/Toggle.tsx";
import { ApiError, api } from "../../lib/api.ts";
import { friendlyErrorMessage } from "../../lib/queryClient.ts";
import { useBootstrap } from "../../lib/queries.ts";
import { qk } from "../../lib/queryKeys.ts";
import { useAdminMutation, useSaveSettings } from "./mutations.ts";
import { SaveNote, TabHeader } from "./parts.tsx";
import { TabLoading } from "./TabLoading.tsx";
import { useAutosaveField } from "./useAutosaveField.ts";

const problemFrom = (schema: z.ZodType) => (v: string) => {
  const r = schema.safeParse(v);
  return r.success ? null : (r.error.issues[0]?.message ?? "Check this.");
};

function AutosaveText({
  label,
  value,
  schema,
  save,
}: {
  label: string;
  value: string;
  schema: z.ZodType;
  save(v: string): Promise<unknown>;
}) {
  const field = useAutosaveField(value, (v) => save(v.trim()), { validate: problemFrom(schema) });
  return (
    <div className="relative">
      <TextField
        label={label}
        value={field.draft}
        onChange={(e) => field.setDraft(e.target.value)}
        onBlur={() => void field.flush()}
        autoCapitalize="words"
        error={field.error ?? undefined}
      />
      <SaveNote status={field.status} className="absolute right-0 top-0.5" />
    </div>
  );
}

type SecretKind = "password" | "pin";

const SECRET_COPY: Record<SecretKind, { title: string; noun: string; done: string }> = {
  password: { title: "Change password", noun: "password", done: "Password changed" },
  pin: { title: "Change PIN", noun: "PIN", done: "PIN changed" },
};

type SecretErrors = Partial<Record<"current" | "next" | "again", string>>;

/** Current, new, and new again, with an explicit Save. Clears itself after a change. */
function ChangeSecretForm({ kind }: { kind: SecretKind }) {
  const copy = SECRET_COPY[kind];
  const isPin = kind === "pin";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [errors, setErrors] = useState<SecretErrors>({});
  const change = useAdminMutation(
    (b: { current: string; next: string }) => (isPin ? api.changePin(b.current, b.next) : api.changePassword(b.current, b.next)),
    { silent: true },
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found: SecretErrors = {};
    if (!current) found.current = `Enter your current ${copy.noun}.`;
    else if (isPin && !pinSchema.safeParse(current).success) found.current = "The PIN is 4 to 6 digits.";
    const nextProblem = problemFrom(isPin ? pinSchema : passwordSchema)(next);
    if (nextProblem) found.next = nextProblem;
    else if (again !== next) found.again = `The two new ${copy.noun}s don't match.`;
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    try {
      await change.mutateAsync({ current, next });
      toast.success(copy.done);
      setCurrent("");
      setNext("");
      setAgain("");
    } catch (err) {
      // A wrong current value is a 400 ("Your current PIN isn't right."); too many tries is a 429.
      setErrors({ current: friendlyErrorMessage(err) });
      if (err instanceof ApiError && err.status === 400) setCurrent("");
    }
  }

  const secretProps = isPin
    ? { inputMode: "numeric" as const, pattern: "[0-9]*", maxLength: 6, autoComplete: "off" }
    : { autoComplete: "new-password" };
  const clear = (key: keyof SecretErrors) => errors[key] && setErrors({ ...errors, [key]: undefined });

  return (
    <Card>
      <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-4">
        <h3 className="text-2xl">{copy.title}</h3>
        {!isPin && <input type="text" name="username" autoComplete="username" value="teacher" readOnly hidden />}
        <TextField
          label={`Current ${copy.noun}`}
          type="password"
          value={current}
          {...secretProps}
          autoComplete={isPin ? "off" : "current-password"}
          onChange={(e) => {
            setCurrent(isPin ? e.target.value.replace(/\D/g, "") : e.target.value);
            clear("current");
          }}
          error={errors.current}
        />
        <TextField
          label={`New ${copy.noun}`}
          type="password"
          value={next}
          {...secretProps}
          hint={isPin ? "4 to 6 digits" : "At least 8 characters"}
          onChange={(e) => {
            setNext(isPin ? e.target.value.replace(/\D/g, "") : e.target.value);
            clear("next");
          }}
          error={errors.next}
        />
        <TextField
          label={`New ${copy.noun} again`}
          type="password"
          value={again}
          {...secretProps}
          onChange={(e) => {
            setAgain(isPin ? e.target.value.replace(/\D/g, "") : e.target.value);
            clear("again");
          }}
          error={errors.again}
        />
        <div className="flex justify-end">
          <Button type="submit" loading={change.isPending} className="min-w-36">
            Save
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Options({ settings }: { settings: Settings }) {
  const saveSettings = useSaveSettings();
  // The cache is updated straight away, so the switch moves at once; errors toast here.
  const set = (p: Partial<Settings>) =>
    void saveSettings(p).catch((err: unknown) => toast.error(friendlyErrorMessage(err)));
  return (
    <Card className="flex flex-col gap-2">
      <h3 className="mb-1 text-2xl">Options</h3>
      <Toggle
        label="Reports need PIN"
        description="Ask for the PIN before showing reports."
        checked={settings.reportsNeedPin}
        onChange={(reportsNeedPin) => set({ reportsNeedPin })}
      />
      <Toggle
        label="Sounds on"
        description="The default for every device. Each device can still mute itself from the top bar."
        checked={settings.soundOn}
        onChange={(soundOn) => set({ soundOn })}
      />
    </Card>
  );
}

function LogOutEverywhere() {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const logoutAll = useAdminMutation(() => api.logoutAll());
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-2xl">Log out all devices</h3>
        <p className="text-lg text-muted">Lost a tablet? This logs out everywhere, this device too.</p>
      </div>
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Log out all devices
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Log out everywhere?"
        description="Every device, this one too, will need the password again."
        confirmLabel="Log out all"
        onConfirm={async () => {
          await logoutAll.mutateAsync(undefined);
          await qc.invalidateQueries({ queryKey: qk.auth });
        }}
      />
    </Card>
  );
}

/** Names, password, PIN, options and "Log out all devices" (spec §8.6). */
export function AccountTab() {
  const settings = useBootstrap().data?.settings;
  const saveSettings = useSaveSettings();
  if (!settings) return <TabLoading />;
  return (
    <div className="flex flex-col gap-5">
      <TabHeader title="Account">Names, password, PIN and options.</TabHeader>
      <Card className="grid gap-5 md:grid-cols-2">
        <AutosaveText
          label="Your name"
          value={settings.teacherName}
          schema={personNameSchema}
          save={(teacherName) => saveSettings({ teacherName })}
        />
        <AutosaveText
          label="Class name"
          value={settings.className}
          schema={classNameSchema}
          save={(className) => saveSettings({ className })}
        />
      </Card>
      <div className="grid items-start gap-5 md:grid-cols-2">
        <ChangeSecretForm kind="password" />
        <ChangeSecretForm kind="pin" />
      </div>
      <Options settings={settings} />
      <LogOutEverywhere />
    </div>
  );
}
