import { motion } from "motion/react";
import type { MarkAction, TransitionResult } from "@shared/rules.ts";
import type { MarkStatus, PointValues, Student } from "@shared/types.ts";
import { useReducedMotion } from "../../lib/useReducedMotion.ts";
import { GRID_VARIANTS, SPRING, TILE_VARIANTS, TILE_VARIANTS_REDUCED } from "./motion.ts";
import { StudentTile } from "./StudentTile.tsx";

export interface StudentGridProps {
  students: Student[];
  statusOf(studentId: number): MarkStatus;
  values: PointValues;
  onAct(studentId: number, action: MarkAction): TransitionResult;
  /** Cascade the tiles in (right after "Start lesson"). */
  entrance?: boolean;
}

/*
 * Tile height: on iPad landscape four rows must fit under the top bar, the day header and the footer
 * (Global Constraints: 24 students at 1180×820 without scrolling). 17.5rem is everything on the page
 * that isn't a tile row: top bar 84px, page padding 32px, header 64px, footer 56px, gaps 40px, plus a
 * few px of slack. Taller screens get taller tiles; shorter ones keep a readable minimum and scroll.
 */
const TILE_HEIGHT = "h-[8.5rem] lg:h-[max(8.25rem,calc((100dvh-17.5rem)/4))]";

/** The class as a grid of tiles: 2 across on a phone, 4 on iPad portrait, 6 on iPad landscape. */
export function StudentGrid({ students, statusOf, values, onAct, entrance = false }: StudentGridProps) {
  const reduce = useReducedMotion();
  return (
    <motion.ul
      aria-label="Students"
      className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6"
      variants={GRID_VARIANTS}
      initial={entrance ? "hidden" : false}
      animate="show"
    >
      {students.map((s) => (
        <motion.li
          key={s.id}
          layout={!reduce}
          variants={reduce ? TILE_VARIANTS_REDUCED : TILE_VARIANTS}
          transition={SPRING}
          className={TILE_HEIGHT}
        >
          <StudentTile student={s} status={statusOf(s.id)} values={values} onAct={onAct} />
        </motion.li>
      ))}
    </motion.ul>
  );
}
