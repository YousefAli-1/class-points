import { COLORS, type ColorKey } from "@shared/palette.ts";
import { cx } from "../../lib/cx.ts";

const SIZES = {
  sm: "size-10 border-2 text-xl",
  md: "size-14 border-[3px] text-3xl",
  lg: "size-[4.5rem] border-[3px] text-[2.5rem]",
  xl: "size-24 border-4 text-[3.25rem]",
} as const;

export interface AvatarProps {
  emoji: string;
  color: ColorKey;
  size?: keyof typeof SIZES;
  /** Greyed out, e.g. an absent or archived student. */
  dimmed?: boolean;
}

/** A child's animal emoji on a coloured circle. Decorative: the name is always shown next to it. */
export function Avatar({ emoji, color, size = "md", dimmed = false }: AvatarProps) {
  const c = COLORS[color] ?? COLORS.leaf;
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full leading-none transition-[filter,opacity]",
        "shadow-[inset_0_-4px_0_0_rgb(0_0_0/0.06),inset_0_3px_0_0_rgb(255_255_255/0.6)]",
        SIZES[size],
        dimmed && "opacity-55 grayscale",
      )}
      style={{ backgroundColor: c.bg, borderColor: c.ring }}
    >
      {emoji}
    </span>
  );
}
