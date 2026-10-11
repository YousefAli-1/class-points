import { useId } from "react";
import { MinusIcon, PlusIcon } from "../icons.tsx";
import { IconButton } from "./IconButton.tsx";

export interface StepperProps {
  value: number;
  onChange(value: number): void;
  min: number;
  max: number;
  label: string;
  format?(n: number): string;
}

/** − value + with big buttons, for small whole numbers such as point values. */
export function Stepper({ value, onChange, min, max, label, format }: StepperProps) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <span id={labelId} className="font-display text-lg font-semibold text-forest">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <IconButton
          label={`Decrease ${label}`}
          icon={<MinusIcon />}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        />
        <output aria-live="polite" className="min-w-20 text-center font-display text-4xl font-bold text-ink tabular-nums">
          {format ? format(value) : value}
        </output>
        <IconButton
          label={`Increase ${label}`}
          icon={<PlusIcon />}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        />
      </div>
    </div>
  );
}
