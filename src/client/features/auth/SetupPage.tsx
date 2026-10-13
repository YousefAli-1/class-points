import { useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router";
import { toast } from "sonner";
import { classNameSchema, passwordSchema, personNameSchema, pinSchema } from "@shared/schemas.ts";
import type { MascotMood } from "../../components/Mascot.tsx";
import { ArrowLeftIcon, CheckIcon } from "../../components/icons.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { Chip } from "../../components/ui/Chip.tsx";
import { Field } from "../../components/ui/Field.tsx";
import { TextField } from "../../components/ui/TextField.tsx";
import { INPUT_CLASS, describedBy } from "../../components/ui/styles.ts";
import { ApiError, api } from "../../lib/api.ts";
import { celebrate } from "../../lib/confetti.ts";
import { cx } from "../../lib/cx.ts";
import { useAuthStatus, useToday } from "../../lib/queries.ts";
import { friendlyErrorMessage } from "../../lib/queryClient.ts";
import { useSound } from "../../lib/sound.ts";
import { AuthLayout } from "./AuthLayout.tsx";
import { SetupCodeField } from "./SetupCodeField.tsx";
import { PIN_INPUT, onlyProblems, problemWith } from "./validate.ts";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Sunday to Thursday (decision recorded in the task report); she changes it with one tap per day. */
const DEFAULT_SCHOOL_DAYS = [0, 1, 2, 3, 4];
const MAX_STUDENTS = 60;

const STEPS = [
  { label: "Names", title: "Let's set up your class", mood: "wave" },
  { label: "Secrets", title: "Keep it safe", mood: "think" },
  { label: "School week", title: "Your school week", mood: "cheer" },
] as const satisfies readonly { label: string; title: string; mood: MascotMood }[];

type Step = 0 | 1 | 2;
type FieldName =
  | "setupCode"
  | "teacherName"
  | "className"
  | "password"
  | "password2"
  | "pin"
  | "pin2"
  | "schoolDays"
  | "students";
type Values = Omit<Record<FieldName, string>, "schoolDays"> & { schoolDays: number[] };

/** One name per line, blank lines skipped. */
function studentNames(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function problemsFor(step: Step, v: Values): Partial<Record<FieldName, string>> | null {
  if (step === 0) {
    return onlyProblems({
      setupCode: v.setupCode.trim() ? undefined : "Enter the setup code.",
      teacherName: problemWith(personNameSchema, v.teacherName),
      className: problemWith(classNameSchema, v.className),
    });
  }
  if (step === 1) {
    return onlyProblems({
      password: problemWith(passwordSchema, v.password),
      password2: v.password2 === v.password ? undefined : "The passwords don't match.",
      pin: problemWith(pinSchema, v.pin),
      pin2: v.pin2 === v.pin ? undefined : "The PINs don't match.",
    });
  }
  const names = studentNames(v.students);
  const tooLong = names.find((n) => n.length > 40);
  return onlyProblems({
    schoolDays: v.schoolDays.length ? undefined : "Pick at least one school day.",
    students: tooLong
      ? `Names can be up to 40 characters: "${tooLong.slice(0, 20)}…"`
      : names.length > MAX_STUDENTS
        ? `Add up to ${MAX_STUDENTS} students here. You can add more in Admin.`
        : undefined,
  });
}

function StepDots({ step }: { step: Step }) {
  return (
    <ol className="mb-5 flex items-center justify-center gap-2" aria-label="Setup steps">
      {STEPS.map((s, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={s.label} className="flex items-center gap-2" aria-current={current ? "step" : undefined}>
            {i > 0 && <span aria-hidden="true" className={cx("h-1 w-6 rounded-full", done || current ? "bg-leaf" : "bg-line")} />}
            <span
              className={cx(
                "flex size-9 items-center justify-center rounded-full font-display text-lg font-bold",
                done && "bg-leaf text-white",
                current && "bg-forest text-white ring-4 ring-sprout/60",
                !done && !current && "bg-mint-deep text-muted",
              )}
            >
              {done ? <CheckIcon size={18} /> : i + 1}
              <span className="sr-only">
                {" "}
                {s.label}
                {done ? " (done)" : ""}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** First-run wizard (spec §8.2): setup code and names → password and PIN → school days and students. */
export function SetupPage() {
  const auth = useAuthStatus().data;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const today = useToday();
  const play = useSound();
  const studentsId = useId();
  const [step, setStep] = useState<Step>(0);
  const [values, setValues] = useState<Values>({
    setupCode: "",
    teacherName: "",
    className: "",
    password: "",
    password2: "",
    pin: "",
    pin2: "",
    schoolDays: DEFAULT_SCHOOL_DAYS,
    students: "",
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (auth?.setupDone && !busy) return <Navigate to={auth.loggedIn ? "/" : "/login"} replace />;

  const set = <K extends keyof Values>(name: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setErrors((errs) => ({ ...errs, [name]: undefined }));
  };
  const field = (name: Exclude<FieldName, "schoolDays" | "students">) => ({
    value: values[name],
    error: errors[name],
    onChange: (e: { target: { value: string } }) => set(name, e.target.value),
  });

  function toggleDay(day: number) {
    const days = values.schoolDays.includes(day)
      ? values.schoolDays.filter((d) => d !== day)
      : [...values.schoolDays, day].sort((a, b) => a - b);
    set("schoolDays", days);
  }

  async function finish() {
    setBusy(true);
    setFormError(undefined);
    const { setupCode, teacherName, className, password, pin, schoolDays } = values;
    try {
      await api.setup({
        setupCode: setupCode.trim(),
        teacherName: teacherName.trim(),
        className: className.trim(),
        password,
        pin,
        schoolDays,
      });
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 401) {
        setStep(0);
        setErrors({ setupCode: err.message });
      } else if (err instanceof ApiError && err.code === "CONFLICT") {
        toast.info(err.message);
        navigate("/login", { replace: true });
      } else {
        setFormError(friendlyErrorMessage(err));
      }
      return;
    }

    const names = studentNames(values.students);
    if (names.length) {
      // Adding students is an admin action, so unlock with the PIN she just chose, then lock again.
      try {
        await api.unlock(pin);
        await api.createStudents(names, today);
      } catch {
        toast.error("Your class is ready, but the students couldn't be added. You can add them in Admin.");
      } finally {
        await api.lock().catch(() => {});
      }
    }

    await qc.invalidateQueries();
    play("sparkle");
    celebrate("start");
    toast.success(`Welcome, ${teacherName.trim()}! Your class is ready.`);
    navigate("/", { replace: true });
  }

  function next(e: FormEvent) {
    e.preventDefault();
    const problems = problemsFor(step, values);
    if (problems) {
      setErrors(problems);
      return;
    }
    if (step < 2) setStep((step + 1) as Step);
    else void finish();
  }

  const names = studentNames(values.students);
  const studentsHint = names.length
    ? `${names.length} ${names.length === 1 ? "student" : "students"}. Each gets an animal avatar.`
    : "One name per line. You can also do this later in Admin.";
  const current = STEPS[step];

  return (
    <AuthLayout mood={current.mood} title={current.title} header={<StepDots step={step} />} wide>
      <form onSubmit={next} className="flex flex-col gap-4" noValidate>
        {step === 0 && (
          <>
            <p className="-mt-2 mb-1 text-center text-lg text-muted">First, the setup code and a few names.</p>
            <SetupCodeField
              hint="You got it from the person who installed Class Points."
              autoFocus
              {...field("setupCode")}
            />
            <TextField label="Your name" placeholder="e.g. Ms Sara" autoComplete="name" {...field("teacherName")} />
            <TextField label="Class name" placeholder="e.g. Class 2B" autoComplete="off" {...field("className")} />
          </>
        )}

        {step === 1 && (
          <>
            <p className="-mt-2 mb-1 text-center text-lg text-muted">
              A password to log in, and a PIN that opens the Admin area.
            </p>
            <input type="text" name="username" autoComplete="username" value="teacher" readOnly hidden />
            <TextField
              label="Password"
              type="password"
              autoComplete="new-password"
              hint="At least 8 characters."
              autoFocus
              {...field("password")}
            />
            <TextField label="Password again" type="password" autoComplete="new-password" {...field("password2")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="PIN" hint="4 to 6 digits." {...PIN_INPUT} {...field("pin")} />
              <TextField label="PIN again" hint="Just to be sure." {...PIN_INPUT} {...field("pin2")} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <fieldset>
              <legend className="mb-2 font-display text-lg font-semibold text-forest">Which days are school days?</legend>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 [&>*]:px-0">
                {WEEKDAYS.map((label, day) => (
                  <Chip key={label} selected={values.schoolDays.includes(day)} onClick={() => toggleDay(day)}>
                    {label}
                  </Chip>
                ))}
              </div>
              {errors.schoolDays && <p className="mt-2 text-base font-bold text-honey-deep">{errors.schoolDays}</p>}
            </fieldset>

            <Field
              inputId={studentsId}
              label="Add your students now (optional)"
              hint={studentsHint}
              error={errors.students}
            >
              <textarea
                id={studentsId}
                rows={6}
                placeholder={"Adam\nLaila\nOmar"}
                aria-invalid={errors.students ? true : undefined}
                aria-describedby={describedBy(studentsId, studentsHint, errors.students)}
                className={cx(INPUT_CLASS, "h-auto min-h-40 resize-y py-3 leading-relaxed")}
                value={values.students}
                onChange={(e) => set("students", e.target.value)}
              />
            </Field>
          </>
        )}

        {formError && (
          <p role="alert" className="rounded-2xl bg-sunshine-soft px-4 py-3 text-base font-bold text-honey-deep">
            {formError}
          </p>
        )}

        <div className="mt-2 flex gap-3">
          {step > 0 && (
            <Button
              variant="secondary"
              size="lg"
              icon={<ArrowLeftIcon />}
              disabled={busy}
              onClick={() => setStep((step - 1) as Step)}
            >
              Back
            </Button>
          )}
          <Button type="submit" size="lg" loading={busy} className="flex-1">
            {step < 2 ? "Next" : "Let's go! 🌱"}
          </Button>
        </div>
      </form>
    </AuthLayout>
  );
}
