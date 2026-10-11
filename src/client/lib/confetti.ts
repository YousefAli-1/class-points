import confetti from "canvas-confetti";
import { THEME } from "@shared/palette.ts";

// Celebrations with canvas-confetti. Our own canvas and no Web Worker, so nothing needs a blob: URL.

export type CelebrationKind = "start" | "podium" | "small";

/** Viewport pixels, e.g. the centre of the button that was tapped. */
export interface ScreenPoint {
  x: number;
  y: number;
}

const GREEN_AND_GOLD = [THEME.leaf, THEME.sprout, THEME.sunshine, THEME.white, THEME.forest];
const STARS = [THEME.sunshine, "#FFE27A", THEME.leaf, THEME.sprout];

let fire: confetti.CreateTypes | null = null;

function cannon(): confetti.CreateTypes {
  if (fire) return fire;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.setAttribute("data-print-hide", "");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "80",
  });
  document.body.appendChild(canvas);
  fire = confetti.create(canvas, { resize: true, useWorker: false, disableForReducedMotion: true });
  return fire;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** The centre of an element, for `celebrate(kind, originOf(el))`. */
export function originOf(el: Element): ScreenPoint {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * A burst of confetti. `start` for starting a lesson, `podium` for the report podium, `small` for a
 * few stars (e.g. points back to +1). Skipped entirely when the device asks for reduced motion.
 */
export function celebrate(kind: CelebrationKind, origin?: ScreenPoint): void {
  if (typeof window === "undefined" || prefersReducedMotion()) return;
  const at = origin
    ? { x: origin.x / window.innerWidth, y: origin.y / window.innerHeight }
    : { x: 0.5, y: kind === "small" ? 0.5 : 0.65 };
  const shoot = cannon();

  switch (kind) {
    case "small":
      void shoot({
        origin: at,
        particleCount: 22,
        spread: 70,
        startVelocity: 20,
        gravity: 0.8,
        ticks: 90,
        scalar: 0.9,
        shapes: ["star"],
        colors: STARS,
      });
      return;
    case "start":
      void shoot({ origin: at, particleCount: 90, spread: 80, startVelocity: 42, ticks: 160, colors: GREEN_AND_GOLD });
      void shoot({
        origin: at,
        particleCount: 40,
        spread: 120,
        startVelocity: 30,
        ticks: 160,
        scalar: 1.2,
        shapes: ["star"],
        colors: STARS,
      });
      return;
    case "podium": {
      const end = Date.now() + 1400;
      const frame = () => {
        const shared = { particleCount: 5, spread: 60, startVelocity: 55, ticks: 200, colors: GREEN_AND_GOLD };
        void shoot({ ...shared, angle: 60, origin: { x: 0, y: 0.75 } });
        void shoot({ ...shared, angle: 120, origin: { x: 1, y: 0.75 } });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
      void shoot({ origin: at, particleCount: 60, spread: 100, startVelocity: 35, shapes: ["star"], colors: STARS });
      return;
    }
  }
}
