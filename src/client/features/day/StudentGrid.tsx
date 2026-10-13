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
 * Tile height. On a phone the page scrolls and tiles keep a fixed height. From iPad width up the day
 * view fills exactly one screen (`fit-screen`, see index.css): the grid takes the height left under
 * the header and above the footer, and splits it into 4 rows in landscape (24 students on 6 columns)
 * or 6 in portrait (4 columns). Fewer students keep the same tile size; more add rows that share the
 * height too.
 *
 * Each tile is a size container: below 8.0625rem (its full content) it switches to a smaller avatar
 * (StudentTile), which lets it go down to 7.375rem with the 56px card buttons still inside. That fits
 * 24 tiles in iPad Safari with its toolbars (about 1180×744). On a screen too short even for that the
 * page scrolls, and the footer, which sits below the grid, never covers a tile.
 */
const GRID_ROWS = [
  "md:grid-rows-[repeat(6,minmax(7.375rem,1fr))] md:auto-rows-[minmax(7.375rem,1fr)]",
  "lg:grid-rows-[repeat(4,minmax(7.375rem,1fr))]",
].join(" ");

/** The class as a grid of tiles: 2 across on a phone, 4 on iPad portrait, 6 on iPad landscape. */
export function StudentGrid({ students, statusOf, values, onAct, entrance = false }: StudentGridProps) {
  const reduce = useReducedMotion();
  return (
    <motion.ul
      aria-label="Students"
      className={`grid grid-cols-2 gap-2 md:flex-1 md:grid-cols-4 lg:grid-cols-6 ${GRID_ROWS}`}
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
          className="h-[8.5rem] md:h-auto md:[container-type:size]"
        >
          <StudentTile student={s} status={statusOf(s.id)} values={values} onAct={onAct} />
        </motion.li>
      ))}
    </motion.ul>
  );
}
