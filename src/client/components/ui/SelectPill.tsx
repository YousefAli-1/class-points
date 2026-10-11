import { Select } from "radix-ui";
import type { CSSProperties } from "react";
import { COLORS, type ColorKey } from "@shared/palette.ts";
import { cx } from "../../lib/cx.ts";
import { CheckIcon, ChevronDownIcon } from "../icons.tsx";

export interface SelectPillOption {
  value: string;
  label: string;
  emoji?: string;
  color?: ColorKey;
  /** A short second line, e.g. "Not started yet". */
  hint?: string;
}

export interface SelectPillProps {
  value: string;
  onValueChange(value: string): void;
  ariaLabel: string;
  options: SelectPillOption[];
}

/** A big chunky pill that opens a list, tinted with the chosen option's colour (the day view's subject picker). */
export function SelectPill({ value, onValueChange, ariaLabel, options }: SelectPillProps) {
  const selected = options.find((o) => o.value === value);
  const tint = COLORS[selected?.color ?? "leaf"];

  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger
        aria-label={ariaLabel}
        style={{ backgroundColor: tint.bg, borderColor: tint.ring, "--edge": tint.ring } as CSSProperties}
        className={cx(
          "chunky inline-flex min-h-16 max-w-full select-none items-center gap-3 rounded-full border-[3px] py-2 pl-4 pr-3",
          "font-display text-2xl font-semibold text-ink outline-none focus-visible:outline-3 focus-visible:outline-forest",
        )}
      >
        {selected?.emoji && (
          <span aria-hidden="true" className="text-[1.75rem] leading-none">
            {selected.emoji}
          </span>
        )}
        <span className="min-w-0 truncate">
          <Select.Value>{selected?.label}</Select.Value>
        </span>
        <Select.Icon className="ml-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-forest">
          <ChevronDownIcon size={22} />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          data-cp-popover
          position="popper"
          sideOffset={10}
          collisionPadding={16}
          className={cx(
            "z-50 max-h-[var(--radix-select-content-available-height)] min-w-[max(var(--radix-select-trigger-width),16rem)]",
            "overflow-hidden rounded-card bg-white p-2 shadow-pop ring-1 ring-line",
          )}
        >
          <Select.Viewport>
            {options.map((o) => {
              const c = COLORS[o.color ?? "leaf"];
              return (
                <Select.Item
                  key={o.value}
                  value={o.value}
                  className={cx(
                    "flex min-h-14 cursor-pointer select-none items-center gap-3 rounded-2xl px-3 py-2 outline-none",
                    "data-[highlighted]:bg-mint data-[state=checked]:bg-sprout-soft",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-11 shrink-0 items-center justify-center rounded-full border-2 text-2xl leading-none"
                    style={{ backgroundColor: c.bg, borderColor: c.ring }}
                  >
                    {o.emoji ?? "•"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-xl font-semibold text-ink">
                      <Select.ItemText>{o.label}</Select.ItemText>
                    </span>
                    {o.hint && <span className="block text-sm text-muted">{o.hint}</span>}
                  </span>
                  <Select.ItemIndicator className="text-leaf-deep">
                    <CheckIcon />
                  </Select.ItemIndicator>
                </Select.Item>
              );
            })}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
