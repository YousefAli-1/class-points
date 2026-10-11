import type { CSSProperties, ReactNode } from "react";
import { COLORS, type ColorKey } from "@shared/palette.ts";
import { cx } from "../../lib/cx.ts";
import { CheckIcon } from "../icons.tsx";

export interface ChipProps {
  selected?: boolean;
  onClick?(): void;
  color?: ColorKey;
  children: ReactNode;
}

/** A round pill. With `onClick` it is a toggle button (weekday picker, subject filters). */
export function Chip({ selected = false, onClick, color, children }: ChipProps) {
  const tint = COLORS[color ?? "leaf"];
  const style = selected
    ? ({ backgroundColor: tint.bg, borderColor: tint.ring, "--edge": tint.ring } as CSSProperties)
    : undefined;
  const className = cx(
    "inline-flex min-h-14 select-none items-center justify-center gap-1.5 rounded-full border-2 px-5",
    "font-display text-lg font-semibold",
    selected ? "text-ink" : "border-line bg-white text-muted [--edge:var(--color-line-deep)]",
    onClick && "chunky",
    onClick && !selected && "hover:border-line-deep hover:text-forest",
  );
  const content = (
    <>
      {selected && <CheckIcon size={20} className="-ml-1 text-forest" />}
      {children}
    </>
  );

  if (!onClick) {
    return (
      <span className={className} style={style}>
        {content}
      </span>
    );
  }
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={className} style={style}>
      {content}
    </button>
  );
}
