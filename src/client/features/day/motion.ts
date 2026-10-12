import type { Transition, Variants } from "motion/react";

// Shared motion settings for the day view, so every tile, card and badge moves with the same feel.

/** Snappy and a little bouncy (spec §8.4). */
export const SPRING: Transition = { type: "spring", stiffness: 500, damping: 22 };

/** The sideways "nope" shake for a Penalty tapped before a Warning. */
export const NOPE_SHAKE = { x: [0, -10, 10, -6, 6, 0] };

/** The tiny wobble a tile does when a card lands on it. */
export const CARD_WOBBLE = { rotate: [0, -1.6, 1.4, -0.8, 0] };

/** How tiles cascade into the grid when a lesson starts. */
export const GRID_VARIANTS: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03, delayChildren: 0.05 } },
};

export const TILE_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.8 },
  show: { opacity: 1, y: 0, scale: 1, transition: SPRING },
};

/** With reduced motion the tiles only fade in. */
export const TILE_VARIANTS_REDUCED: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.25 } },
};
