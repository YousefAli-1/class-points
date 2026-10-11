import { useId } from "react";
import { isValidISODate } from "@shared/dates.ts";
import type { ISODate } from "@shared/types.ts";
import { cx } from "../../lib/cx.ts";
import { Field } from "./Field.tsx";
import { INPUT_CLASS } from "./styles.ts";

export interface DateFieldProps {
  value: ISODate;
  onChange(value: ISODate): void;
  label: string;
  max?: ISODate;
}

/** A labelled date picker (the device's own). Clearing it is ignored, so it always holds a real date. */
export function DateField({ value, onChange, label, max }: DateFieldProps) {
  const id = useId();
  return (
    <Field inputId={id} label={label}>
      <input
        id={id}
        type="date"
        value={value}
        max={max}
        required
        onChange={(e) => {
          const next = e.target.value;
          if (isValidISODate(next) && (!max || next <= max)) onChange(next);
        }}
        className={cx(INPUT_CLASS, "appearance-none font-display font-semibold [&::-webkit-date-and-time-value]:text-left")}
      />
    </Field>
  );
}
