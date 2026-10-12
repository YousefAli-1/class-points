import { AnimatePresence, motion } from "motion/react";
import { cx } from "../../lib/cx.ts";
import { useReducedMotion } from "../../lib/useReducedMotion.ts";
import { SPRING } from "./motion.ts";

export type CardState = "off" | "on" | "locked";

export interface CardButtonProps {
  kind: "warning" | "penalty";
  state: CardState;
  studentName: string;
  /** True while the student is absent. */
  disabled?: boolean;
  onPress(): void;
}

const LABELS = { warning: "Warning", penalty: "Penalty" } as const;

/** A little playing card, drawn in the empty slot. */
function CardGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-[45%] max-w-7" aria-hidden="true" focusable="false">
      <rect x="5" y="3" width="14" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M9 8.5h6M9 12h6M9 15.5h3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * One of the two big card buttons on a tile. Off: a dashed empty slot. On: a red card flips into the
 * slot. Locked (Penalty before a Warning): faded with a padlock, but still tappable so it can explain why.
 */
export function CardButton({ kind, state, studentName, disabled = false, onPress }: CardButtonProps) {
  const reduce = useReducedMotion();
  const on = state === "on";
  const label = LABELS[kind];

  return (
    <motion.button
      type="button"
      aria-pressed={on}
      aria-label={`${label} for ${studentName}`}
      disabled={disabled}
      onClick={onPress}
      whileTap={disabled || reduce ? undefined : { scale: 0.92 }}
      transition={SPRING}
      className={cx(
        "group flex h-full min-h-14 w-full min-w-14 select-none flex-col items-center justify-end gap-[3px] rounded-2xl px-1 pb-0.5 pt-1",
        "outline-none focus-visible:outline-3 focus-visible:outline-offset-1 focus-visible:outline-forest",
        "disabled:cursor-not-allowed",
      )}
    >
      <span
        className={cx(
          "relative flex min-h-0 w-full flex-1 items-center justify-center [perspective:420px]",
        )}
      >
        <span className="relative aspect-[5/6] h-full max-h-20">
          {/* The empty slot is always there; the red card lands on top of it. */}
          <span
            className={cx(
              "absolute inset-0 flex items-center justify-center rounded-[10px] border-[2.5px] border-dashed",
              "border-line-deep bg-white/70 text-muted/80 transition-[background-color,border-color,opacity]",
              state === "locked" && "opacity-40",
              !disabled && state !== "locked" && "group-hover:border-sprout group-hover:bg-sprout-soft/60",
            )}
          >
            <CardGlyph />
          </span>

          <AnimatePresence initial={false}>
            {on && (
              <motion.span
                key="card"
                aria-hidden="true"
                initial={reduce ? { opacity: 0 } : { rotateY: 90, y: -14, rotate: -10, opacity: 0.4 }}
                animate={reduce ? { opacity: 1 } : { rotateY: 0, y: 0, rotate: 0, opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { rotateY: -90, scale: 0.9, opacity: 0, transition: { duration: 0.16 } }}
                transition={SPRING}
                className={cx(
                  "absolute inset-0 overflow-hidden rounded-[10px] border-2 border-card-red-deep bg-card-red",
                  "shadow-[0_6px_10px_-4px_rgb(180_35_24/0.55),inset_0_-4px_0_0_rgb(0_0_0/0.14)]",
                )}
              >
                {/* white shine */}
                <span className="absolute -left-1/4 top-0 h-[150%] w-1/3 rotate-[28deg] bg-white/35" />
                <span className="absolute left-[18%] top-[12%] h-[14%] w-[14%] rounded-full bg-white/80" />
              </motion.span>
            )}
          </AnimatePresence>

          {state === "locked" && (
            <span aria-hidden="true" className="absolute -right-2.5 -top-1.5 text-sm leading-none">
              🔒
            </span>
          )}
        </span>
      </span>
      <span
        className={cx(
          "font-display text-xs font-semibold leading-none",
          on ? "text-card-red-deep" : "text-muted",
          state === "locked" && "opacity-60",
        )}
      >
        {label}
      </span>
    </motion.button>
  );
}
