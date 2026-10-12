import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  hasPenaltyCard,
  hasWarningCard,
  pointsFor,
  type MarkAction,
  type TransitionResult,
} from "@shared/rules.ts";
import type { MarkStatus, PointValues, Student } from "@shared/types.ts";
import { Avatar } from "../../components/ui/index.ts";
import { celebrate, originOf } from "../../lib/confetti.ts";
import { cx } from "../../lib/cx.ts";
import { useReducedMotion } from "../../lib/useReducedMotion.ts";
import { CardButton } from "./CardButton.tsx";
import { CARD_WOBBLE, NOPE_SHAKE, SPRING } from "./motion.ts";
import { PointsBadge } from "./PointsBadge.tsx";

const HINT_MS = 2200;

export interface StudentTileProps {
  student: Student;
  status: MarkStatus;
  values: PointValues;
  onAct(studentId: number, action: MarkAction): TransitionResult;
}

/** One child: avatar, name, the Warning and Penalty cards, the points sticker and the absent toggle. */
export function StudentTile({ student, status, values, onAct }: StudentTileProps) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const badgeRef = useRef<HTMLSpanElement>(null);
  const [hint, setHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(hintTimer.current), []);

  const absent = status === "absent";
  const { name } = student;

  function press(action: MarkAction) {
    const result = onAct(student.id, action);
    if (!result.ok) {
      if (result.reason !== "NEED_WARNING") return;
      setHint(true);
      clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(false), HINT_MS);
      if (!reduce) void animate(scope.current, NOPE_SHAKE, { duration: 0.42, ease: "easeInOut" });
      return;
    }
    setHint(false);
    if (action === "absent") return;
    const cardWentOn = result.status === "penalty" || (action === "warning" && result.status === "warning");
    if (cardWentOn) {
      if (!reduce) void animate(scope.current, CARD_WOBBLE, { duration: 0.38, ease: "easeOut" });
    } else if (result.status === "clean" && badgeRef.current) {
      // Back to a clean slate: a little burst of stars from the points sticker.
      celebrate("small", originOf(badgeRef.current));
    }
  }

  return (
    <motion.div
      ref={scope}
      role="group"
      aria-label={name}
      data-status={status}
      animate={{ scale: absent && !reduce ? 0.95 : 1 }}
      transition={SPRING}
      className={cx(
        "relative flex h-full flex-col items-center rounded-card p-1 pt-0.5 transition-[background-color,box-shadow] duration-300",
        absent ? "bg-mist ring-2 ring-line-deep" : "bg-white shadow-soft ring-1 ring-line/70",
        hint && "z-20",
      )}
    >
      <button
        type="button"
        onClick={() => press("absent")}
        aria-label={absent ? `Mark ${name} present` : `Mark ${name} absent`}
        title={absent ? "Back in class" : "Absent today"}
        className="group absolute -left-1 -top-1 z-20 flex size-14 items-center justify-center rounded-full outline-none focus-visible:outline-3 focus-visible:outline-forest"
      >
        <span
          aria-hidden="true"
          className={cx(
            "flex size-10 items-center justify-center rounded-full text-xl leading-none transition-[background-color,box-shadow,filter,opacity]",
            absent
              ? "bg-sunshine shadow-[inset_0_-3px_0_0_var(--color-sunshine-deep)]"
              : "bg-mint ring-2 ring-line opacity-80 grayscale-[0.6] group-hover:opacity-100 group-hover:grayscale-0 group-active:bg-mint-deep",
          )}
        >
          🏠
        </span>
      </button>

      <span className="absolute -right-1 -top-1 z-10">
        <PointsBadge ref={badgeRef} points={pointsFor(status, values)} />
      </span>

      <div className="relative flex h-[3.25rem] shrink-0 items-center justify-center max-sm:scale-[0.8]">
        <Avatar emoji={student.avatar} color={student.color} size="md" dimmed={absent} />
        {absent && (
          <span aria-hidden="true" className="absolute -right-3 -top-1 text-lg leading-none motion-safe:animate-float-up">
            💤
          </span>
        )}
      </div>

      <p
        title={name}
        className={cx(
          "relative z-0 w-full shrink-0 truncate px-1 text-center font-display text-lg font-semibold leading-[1.15] transition-colors",
          absent ? "text-muted" : "text-ink",
        )}
      >
        {name}
      </p>

      <div className="relative z-10 -mt-1.5 grid min-h-0 w-full flex-1 grid-cols-2 gap-1">
        <CardButton
          kind="warning"
          state={hasWarningCard(status) ? "on" : "off"}
          studentName={name}
          disabled={absent}
          onPress={() => press("warning")}
        />
        <CardButton
          kind="penalty"
          state={hasPenaltyCard(status) ? "on" : status === "clean" ? "locked" : "off"}
          studentName={name}
          disabled={absent}
          onPress={() => press("penalty")}
        />
        {absent && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-white px-3.5 py-1 font-display text-base font-semibold text-muted shadow-soft ring-2 ring-line-deep">
              Absent
            </span>
          </span>
        )}
      </div>

      <AnimatePresence>
        {hint && (
          <motion.p
            key="hint"
            role="status"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.8, transition: { duration: 0.15 } }}
            transition={SPRING}
            style={{ originX: 0.75, originY: 1 }}
            className={cx(
              "absolute bottom-[58%] right-1 z-30 w-max max-w-[11rem] rounded-2xl bg-sunshine px-3 py-1.5 text-center",
              "font-display text-base font-semibold leading-tight text-ink shadow-pop ring-2 ring-sunshine-deep",
              "after:absolute after:-bottom-[7px] after:right-7 after:size-3 after:rotate-45 after:bg-sunshine",
              "after:shadow-[2px_2px_0_0_var(--color-sunshine-deep)]",
            )}
          >
            Give a warning first
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
