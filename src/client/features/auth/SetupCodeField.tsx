import { useId, useState, type ComponentPropsWithRef } from "react";
import { Button } from "../../components/ui/Button.tsx";
import { Field } from "../../components/ui/Field.tsx";
import { INPUT_CLASS, describedBy } from "../../components/ui/styles.ts";

export type SetupCodeFieldProps = Omit<ComponentPropsWithRef<"input">, "type" | "id"> & {
  hint?: string;
  error?: string;
};

/**
 * The setup code, masked like a password: it resets the password and the PIN, and the iPad is often
 * on the board (spec §5 mirroring caution). "Show" lets her check a long code she typed.
 */
export function SetupCodeField({ hint, error, ...rest }: SetupCodeFieldProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <Field inputId={id} label="Setup code" hint={hint} error={error}>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type={shown ? "text" : "password"}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={INPUT_CLASS}
          {...rest}
        />
        <Button variant="ghost" aria-controls={id} onClick={() => setShown((s) => !s)} className="shrink-0">
          {shown ? "Hide" : "Show"}
        </Button>
      </div>
    </Field>
  );
}
