import { THEME } from "@shared/palette.ts";
import { cx } from "../lib/cx.ts";

// "Sprout", the class seedling (spec §8.2, §9): a round little sprout in a sunny pot.
// Drawn inline so it is crisp at any size. Idle animations only play when motion is welcome.

export type MascotMood = "happy" | "wave" | "cheer" | "sleep" | "think";

const { forest: FOREST, leaf: LEAF, sprout: SPROUT, sunshine: SUNSHINE, honey: HONEY, ink: INK } = THEME;
/** Illustration-only tints: rosy cheeks and the pot's lighter rim. */
const BLUSH = "#FF8FA3";
const RIM = "#FFE27A";
const WHITE = THEME.white;

const OUTLINE = { stroke: FOREST, strokeWidth: 3, strokeLinejoin: "round", strokeLinecap: "round" } as const;

/** A soft green tube arm with a dark outline. */
function Arm({ d }: { d: string }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path d={d} stroke={FOREST} strokeWidth={9} />
      <path d={d} stroke={SPROUT} strokeWidth={4.5} />
    </g>
  );
}

const ARMS = {
  restLeft: "M34 71 Q25 75 26 81",
  restRight: "M86 71 Q95 75 94 81",
  upLeft: "M34 66 Q22 59 19 47",
  upRight: "M86 66 Q98 59 101 47",
  chin: "M34 71 Q31 82 45 79",
};

function Eyes({ mood }: { mood: MascotMood }) {
  if (mood === "cheer") {
    return (
      <g fill="none" stroke={INK} strokeWidth={3.2} strokeLinecap="round">
        <path d="M44.5 61.5 Q49 55 53.5 61.5" />
        <path d="M66.5 61.5 Q71 55 75.5 61.5" />
      </g>
    );
  }
  if (mood === "sleep") {
    return (
      <g fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round">
        <path d="M44.5 59.5 Q49 64 53.5 59.5" />
        <path d="M66.5 59.5 Q71 64 75.5 59.5" />
      </g>
    );
  }
  // happy and wave look ahead; think looks up and to the side.
  const dx = mood === "think" ? 1.6 : 0;
  const dy = mood === "think" ? -1.8 : 0;
  return (
    <g>
      <ellipse cx={49 + dx} cy={60 + dy} rx={3.9} ry={4.9} fill={INK} />
      <ellipse cx={71 + dx} cy={60 + dy} rx={3.9} ry={4.9} fill={INK} />
      <circle cx={50.4 + dx} cy={58 + dy} r={1.5} fill={WHITE} />
      <circle cx={72.4 + dx} cy={58 + dy} r={1.5} fill={WHITE} />
      {mood === "think" && <path d="M67 50.5 Q72 47.5 77 50" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />}
    </g>
  );
}

function Mouth({ mood }: { mood: MascotMood }) {
  switch (mood) {
    case "cheer":
      return (
        <g>
          <path d="M50 67.5 Q60 83 70 67.5 Z" fill={INK} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <path d="M54.5 74 Q60 79.5 65.5 74 Q60 71.5 54.5 74 Z" fill={BLUSH} />
        </g>
      );
    case "wave":
      return (
        <g>
          <path d="M52 68 Q60 79 68 68 Z" fill={INK} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <path d="M55.5 72.6 Q60 76.6 64.5 72.6 Q60 70.8 55.5 72.6 Z" fill={BLUSH} />
        </g>
      );
    case "sleep":
      return <ellipse cx={60} cy={71} rx={2.6} ry={3.1} fill={INK} />;
    case "think":
      return <path d="M53.5 71.5 Q56.75 69 60 71.5 T66.5 71.5" fill="none" stroke={INK} strokeWidth={2.8} strokeLinecap="round" />;
    default:
      return <path d="M52 69 Q60 77 68 69" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" />;
  }
}

export function Mascot({ mood = "happy", size = 96, className }: { mood?: MascotMood; size?: number; className?: string }) {
  const leftArm = mood === "cheer" ? ARMS.upLeft : mood === "think" ? ARMS.chin : ARMS.restLeft;
  const rightArm = mood === "cheer" ? ARMS.upRight : ARMS.restRight;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      className={cx("shrink-0 overflow-visible", className)}
      data-mood={mood}
    >
      {/* ground shadow */}
      <ellipse cx={60} cy={115} rx={30} ry={4} fill={FOREST} opacity={0.12} />

      <g className={cx(mood === "cheer" ? "motion-safe:animate-hop" : "motion-safe:animate-bob")}>
        {/* leaves on a little stem, swaying from the top of the head */}
        <g className="motion-safe:animate-sway" style={{ transformOrigin: "60px 38px" }}>
          <path d="M60 39 V25" stroke={FOREST} strokeWidth={3.5} strokeLinecap="round" />
          <path d="M59 26 C50 10 36 8 27.5 14 C32 27.5 46 32 59 26 Z" fill={LEAF} {...OUTLINE} />
          <path d="M57 24.5 C49 20.5 41 17 33 15.5" fill="none" stroke={FOREST} strokeWidth={1.8} strokeLinecap="round" opacity={0.5} />
          <path d="M61 24 C66 7 81 2 92.5 8 C88.5 23 74 30 61 24 Z" fill={LEAF} {...OUTLINE} />
          <path d="M63 22.5 C71 17.5 79 12.5 88 9.5" fill="none" stroke={FOREST} strokeWidth={1.8} strokeLinecap="round" opacity={0.5} />
          <ellipse cx={39} cy={15.5} rx={4.5} ry={2} fill={WHITE} opacity={0.4} transform="rotate(20 39 15.5)" />
          <ellipse cx={80} cy={9} rx={4.5} ry={2} fill={WHITE} opacity={0.4} transform="rotate(-18 80 9)" />
        </g>

        {/* round green body */}
        <ellipse cx={60} cy={63} rx={29.5} ry={27.5} fill={SPROUT} {...OUTLINE} />
        <ellipse cx={49} cy={48.5} rx={11} ry={6} fill={WHITE} opacity={0.45} transform="rotate(-24 49 48.5)" />

        <Arm d={leftArm} />
        {mood === "wave" ? (
          <g className="motion-safe:animate-wave" style={{ transformOrigin: "86px 67px" }}>
            <Arm d={ARMS.upRight} />
          </g>
        ) : (
          <Arm d={rightArm} />
        )}

        {/* face */}
        <ellipse cx={41} cy={68.5} rx={5} ry={3.2} fill={BLUSH} opacity={0.5} />
        <ellipse cx={79} cy={68.5} rx={5} ry={3.2} fill={BLUSH} opacity={0.5} />
        <Eyes mood={mood} />
        <Mouth mood={mood} />

        {/* sunny pot */}
        <path d="M33.5 89 H86.5 L81.5 110.5 Q80.6 114 77 114 H43 Q39.4 114 38.5 110.5 Z" fill={SUNSHINE} {...OUTLINE} />
        <path d="M35.5 96 H84.5" stroke={HONEY} strokeWidth={3} opacity={0.35} strokeLinecap="round" />
        <rect x={28} y={81.5} width={64} height={13} rx={6.5} fill={RIM} {...OUTLINE} />
        <path d="M34 85.5 H52" stroke={WHITE} strokeWidth={2.4} strokeLinecap="round" opacity={0.7} />
        <circle cx={60} cy={104} r={3.2} fill={LEAF} opacity={0.9} />
        <circle cx={51} cy={103} r={1.8} fill={LEAF} opacity={0.6} />
        <circle cx={69} cy={103} r={1.8} fill={LEAF} opacity={0.6} />
      </g>

      {mood === "sleep" && (
        <g fill="none" stroke={FOREST} strokeLinecap="round" strokeLinejoin="round">
          <path d="M88 34 h7.5 l-7.5 8.5 h7.5" strokeWidth={2.8} className="motion-safe:animate-float-up" style={{ transformOrigin: "92px 38px" }} />
          <path
            d="M99 19 h5.5 l-5.5 6.5 h5.5"
            strokeWidth={2.3}
            className="motion-safe:animate-float-up [animation-delay:1.2s]"
            style={{ transformOrigin: "101px 22px" }}
          />
        </g>
      )}

      {mood === "think" && (
        <g fill={WHITE} stroke={FOREST} strokeWidth={2}>
          <circle cx={92} cy={40} r={2.4} />
          <circle cx={98.5} cy={30.5} r={3.4} />
          <circle cx={106} cy={19} r={5} className="motion-safe:animate-bob" />
        </g>
      )}

      {mood === "cheer" && (
        <g fill={SUNSHINE} stroke={HONEY} strokeWidth={1.2} strokeLinejoin="round">
          <path d="M14 30 l1.8 3.7 4 .6 -2.9 2.8 .7 4 -3.6-1.9 -3.6 1.9 .7-4 -2.9-2.8 4-.6z" className="motion-safe:animate-bob" />
          <path d="M106 34 l1.4 2.9 3.2 .5 -2.3 2.2 .5 3.2 -2.8-1.5 -2.8 1.5 .5-3.2 -2.3-2.2 3.2-.5z" className="motion-safe:animate-bob [animation-delay:0.6s]" />
        </g>
      )}
    </svg>
  );
}
