import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { toast } from "sonner";
import { passwordSchema, pinSchema } from "@shared/schemas.ts";
import { ArrowLeftIcon } from "../../components/icons.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { TextField } from "../../components/ui/TextField.tsx";
import { ApiError, api } from "../../lib/api.ts";
import { useAuthStatus } from "../../lib/queries.ts";
import { friendlyErrorMessage } from "../../lib/queryClient.ts";
import { AuthLayout } from "./AuthLayout.tsx";
import { SetupCodeField } from "./SetupCodeField.tsx";
import { PIN_INPUT, onlyProblems, problemWith } from "./validate.ts";

type FieldName = "setupCode" | "password" | "password2" | "pin" | "pin2";

/** Forgotten password or PIN: the setup code sets new ones and logs her in (spec §5). */
export function ResetPage() {
  const auth = useAuthStatus().data;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [values, setValues] = useState<Record<FieldName, string>>({
    setupCode: "",
    password: "",
    password2: "",
    pin: "",
    pin2: "",
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (auth && !auth.setupDone) return <Navigate to="/setup" replace />;

  const field = (name: FieldName) => ({
    value: values[name],
    error: errors[name],
    onChange: (e: { target: { value: string } }) => {
      setValues((v) => ({ ...v, [name]: e.target.value }));
      if (errors[name]) setErrors((errs) => ({ ...errs, [name]: undefined }));
    },
  });

  async function reset(e: FormEvent) {
    e.preventDefault();
    const problems = onlyProblems({
      setupCode: values.setupCode.trim() ? undefined : "Enter the setup code.",
      password: problemWith(passwordSchema, values.password),
      password2: values.password2 === values.password ? undefined : "The passwords don't match.",
      pin: problemWith(pinSchema, values.pin),
      pin2: values.pin2 === values.pin ? undefined : "The PINs don't match.",
    });
    if (problems) {
      setErrors(problems);
      return;
    }

    setBusy(true);
    setFormError(undefined);
    try {
      await api.reset({ setupCode: values.setupCode.trim(), newPassword: values.password, newPin: values.pin });
      await qc.invalidateQueries();
      toast.success("All set! Your new password and PIN are saved.");
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setErrors({ setupCode: err.message });
      else setFormError(friendlyErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      mood="think"
      title="Forgot something?"
      subtitle="Use the setup code to choose a new password and PIN."
      footer={
        <Link
          to="/login"
          className="inline-flex min-h-14 items-center gap-2 rounded-full px-5 font-display text-lg font-semibold text-forest hover:bg-white/70"
        >
          <ArrowLeftIcon size={20} /> Back to log in
        </Link>
      }
    >
      <form onSubmit={(e) => void reset(e)} className="flex flex-col gap-4" noValidate>
        <SetupCodeField {...field("setupCode")} />
        <input type="text" name="username" autoComplete="username" value="teacher" readOnly hidden />
        <TextField label="New password" type="password" autoComplete="new-password" hint="At least 8 characters." {...field("password")} />
        <TextField label="New password again" type="password" autoComplete="new-password" {...field("password2")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="New PIN" hint="4 to 6 digits." {...PIN_INPUT} {...field("pin")} />
          <TextField label="PIN again" {...PIN_INPUT} {...field("pin2")} />
        </div>
        {formError && (
          <p role="alert" className="rounded-2xl bg-sunshine-soft px-4 py-3 text-base font-bold text-honey-deep">
            {formError}
          </p>
        )}
        <Button type="submit" size="lg" loading={busy} className="mt-1 w-full">
          Save and log in
        </Button>
      </form>
    </AuthLayout>
  );
}
