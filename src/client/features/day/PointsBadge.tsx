import { motion } from "motion/react";
import type { Ref } from "react";
import { formatPoints } from "@shared/rules.ts";
import { cx } from "../../lib/cx.ts";
import { useReducedMotion } from "../../lib/useReducedMotion.ts";
import { SPRING } from "./motion.ts";

export interface PointsBadgeProps {
  /** `null` when the student is absent. */
  points: number | null;
  ref?: Ref<HTMLSpanElement>;
}

function tone(points: number | null): string {
  if (points === null) return "bg-mist text-muted ring-line-deep";
  if (points > 0) return "bg-leaf text-white ring-leaf-deep [text-shadow:0_1px_0_rgb(11_58_30/0.35)]";
  if (points === 0) return "bg-sunshine text-ink ring-sunshine-deep";
  return "bg-coral text-white ring-coral-deep [text-shadow:0_1px_1px_rgb(120_30_20/0.45)]";
}

/** The round points sticker on a tile: +N green with a star, 0 yellow, −N coral, "–" grey when absent. */
export function PointsBadge({ points, ref }: PointsBadgeProps) {
  const reduce = useReducedMotion();
  const label = points === null ? "–" : formatPoints(points);

  return (
    <span
      ref={ref}
      className={cx(
        "relative inline-flex size-14 shrink-0 select-none items-center justify-center rounded-full ring-[3px] ring-inset",
        "font-display text-[1.75rem] font-bold leading-none tabular-nums transition-colors duration-300",
        "shadow-[inset_0_-4px_0_0_rgb(0_0_0/0.12),inset_0_3px_0_0_rgb(255_255_255/0.35)]",
        tone(points),
      )}
    >
      <motion.span
        key={label}
        initial={reduce ? false : { scale: 1.4 }}
        animate={{ scale: 1 }}
        transition={SPRING}
        className="inline-block"
      >
        {label}
      </motion.span>
      <span className="sr-only">{points === null ? " absent, no points" : " points"}</span>
      {points !== null && points > 0 && (
        <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 text-xl leading-none drop-shadow-sm">
          ⭐
        </span>
      )}
    </span>
  );
}
