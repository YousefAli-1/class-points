import { useId } from "react";
import { THEME } from "@shared/palette.ts";

const LEAF = "M0 -13 C8 -8 8 6 0 13 C-8 6 -8 -8 0 -13 Z";

const LEAVES = [
  { x: 30, y: 40, r: -25, s: 1 },
  { x: 122, y: 28, r: 35, s: 0.8 },
  { x: 84, y: 108, r: -60, s: 1.1 },
  { x: 156, y: 142, r: 15, s: 0.9 },
  { x: 22, y: 152, r: 70, s: 0.75 },
];

const DOTS = [
  { x: 72, y: 52, r: 2.6 },
  { x: 150, y: 86, r: 2 },
  { x: 112, y: 166, r: 3 },
  { x: 44, y: 98, r: 1.8 },
];

/** The soft leaf pattern behind every screen (spec §9). Drawn inline: no image request, nothing to block. */
export function LeafBackdrop() {
  // useId output may hold characters that are awkward inside url(#…), so keep only safe ones.
  const id = `cp-leaves-${useId().replace(/[^\w-]/g, "")}`;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-print-hide
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    >
      <defs>
        <pattern id={id} width="180" height="180" patternUnits="userSpaceOnUse" patternTransform="rotate(-8)">
          {LEAVES.map((l, i) => (
            <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.r}) scale(${l.s})`}>
              <path d={LEAF} fill={THEME.forest} opacity="0.055" />
              <path d="M0 -9 V10" stroke={THEME.forest} strokeWidth="1.4" strokeLinecap="round" opacity="0.05" />
            </g>
          ))}
          {DOTS.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={THEME.leaf} opacity="0.1" />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
