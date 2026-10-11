import { useId, type ComponentPropsWithRef } from "react";
import { Field } from "./Field.tsx";
import { INPUT_CLASS, describedBy } from "./styles.ts";

export type TextFieldProps = ComponentPropsWithRef<"input"> & {
  label: string;
  error?: string;
  hint?: string;
};

/** A labelled input with an optional hint and a friendly error. `className` goes on the wrapper. */
export function TextField({ label, error, hint, id, className, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field inputId={inputId} label={label} hint={hint} error={error} className={className}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, hint, error)}
        className={INPUT_CLASS}
        {...rest}
      />
    </Field>
  );
}
