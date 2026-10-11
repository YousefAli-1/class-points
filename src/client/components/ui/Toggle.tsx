import { Switch } from "radix-ui";
import { useId } from "react";
import { cx } from "../../lib/cx.ts";

export interface ToggleProps {
  checked: boolean;
  onChange(checked: boolean): void;
  label: string;
  description?: string;
}

/** An on/off switch with its label. The whole row is at least 56px tall and the label toggles it too. */
export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className="flex min-h-14 items-center justify-between gap-4">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer py-1">
        <span className="block text-lg font-bold text-ink">{label}</span>
        {description && (
          <span id={descriptionId} className="block text-base text-muted">
            {description}
          </span>
        )}
      </label>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={descriptionId}
        className="group inline-flex h-14 w-20 shrink-0 items-center justify-center rounded-full outline-none focus-visible:outline-3 focus-visible:outline-forest"
      >
        <span
          className={cx(
            "flex h-10 w-[4.25rem] items-center rounded-full border-2 p-0.5 transition-colors",
            "border-line-deep bg-mist group-data-[state=checked]:border-leaf-deep group-data-[state=checked]:bg-leaf",
          )}
        >
          <Switch.Thumb
            className={cx(
              "block size-8 rounded-full bg-white shadow-[0_2px_0_0_rgb(18_48_31/0.2)] transition-[translate]",
              "data-[state=checked]:translate-x-[1.75rem]",
            )}
          />
        </span>
      </Switch.Root>
    </div>
  );
}
