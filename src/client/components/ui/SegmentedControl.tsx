import { RadioGroup } from "radix-ui";
import { cx } from "../../lib/cx.ts";

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange(value: T): void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}

/** A row of choices where exactly one is on (e.g. Day | Week | Month). Arrow keys move between them. */
export function SegmentedControl<T extends string>({ value, onChange, options, ariaLabel }: SegmentedControlProps<T>) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onChange(v as T)}
      aria-label={ariaLabel}
      orientation="horizontal"
      className="inline-flex max-w-full gap-1 rounded-full bg-mint-deep p-1.5 ring-1 ring-line/80"
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.value}
          value={o.value}
          className={cx(
            "min-h-14 flex-1 select-none whitespace-nowrap rounded-full px-5 font-display text-lg font-semibold transition-colors",
            "text-muted hover:text-forest",
            "data-[state=checked]:bg-white data-[state=checked]:text-forest",
            "data-[state=checked]:shadow-[0_3px_0_0_var(--color-line-deep),0_8px_16px_-10px_rgb(18_48_31/0.4)]",
          )}
        >
          {o.label}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
