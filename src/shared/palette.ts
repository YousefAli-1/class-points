/** Colour keys a student or subject can wear. The order is the auto-assignment cycle. */
export const COLOR_KEYS = ["leaf", "forest", "sunshine", "sky", "berry", "coral", "grape", "ocean", "peach", "lime"] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];

/** A soft background for the avatar circle and a darker ring around it. */
export const COLORS: Record<ColorKey, { bg: string; ring: string }> = {
  leaf: { bg: "#D3F4DF", ring: "#22A55B" },
  forest: { bg: "#CDE5D5", ring: "#14532D" },
  sunshine: { bg: "#FFF3C4", ring: "#C99A06" },
  sky: { bg: "#D6EEFF", ring: "#2B8FD6" },
  berry: { bg: "#FAD4E4", ring: "#C2185B" },
  coral: { bg: "#FFDDD8", ring: "#D9503F" },
  grape: { bg: "#E6DAFA", ring: "#7C4DCC" },
  ocean: { bg: "#CFF1F1", ring: "#138A8A" },
  peach: { bg: "#FFE4CC", ring: "#E07A2E" },
  lime: { bg: "#EAF7C6", ring: "#7FA81B" },
};

/** App colour tokens (spec §9). Red is only for cards; coral only for negative points. */
export const THEME = {
  forest: "#14532D",
  leaf: "#22A55B",
  sprout: "#86E0A7",
  mint: "#EEF9F1",
  white: "#FFFFFF",
  sunshine: "#FFD23F",
  honey: "#B7791F",
  cardRed: "#E5383B",
  coral: "#F26B5B",
  ink: "#12301F",
} as const;

/** Animal avatars, handed out in this order. Single code points only, so they render the same everywhere. */
export const AVATARS: readonly string[] = [
  "🦊", "🐼", "🐸", "🐯", "🦁", "🐨", "🐰", "🐻", "🐵", "🐮",
  "🐔", "🐧", "🐤", "🦉", "🐢", "🐙", "🐬", "🐳", "🦋", "🐝",
  "🐞", "🦄", "🐶", "🐱", "🐭", "🐹", "🦒", "🦓", "🐘", "🦔",
  "🦦", "🦥", "🦩", "🦜", "🐠", "🦀", "🐌", "🦘", "🐪", "🐑",
];

/** Emoji offered when choosing a subject icon. */
export const SUBJECT_EMOJIS: readonly string[] = [
  "📚", "🔢", "🔬", "📖", "✏️", "📝", "🔤", "🗣️",
  "🧮", "📐", "📏", "🧪", "🧬", "🔭", "🌱", "🌍",
  "🗺️", "🏛️", "⏳", "🕌", "🎨", "🖍️", "🎭", "🎵",
  "🎹", "⚽", "🏃", "💻", "🧠", "🧩", "💡", "🌟",
];

export const DEFAULT_SUBJECTS: readonly { name: string; emoji: string; color: ColorKey }[] = [
  { name: "English", emoji: "📚", color: "sky" },
  { name: "Mathematics", emoji: "🔢", color: "sunshine" },
  { name: "Science", emoji: "🔬", color: "leaf" },
];

/**
 * Avatars and colours for `count` new students. Unused avatars come first, in list order; once they
 * run out it cycles from the start of the list. Colours continue the cycle from `taken.length`.
 */
export function pickAvatars(count: number, taken: readonly string[]): { avatar: string; color: ColorKey }[] {
  const takenSet = new Set(taken);
  const unused = AVATARS.filter((a) => !takenSet.has(a));
  const picks: { avatar: string; color: ColorKey }[] = [];
  for (let i = 0; i < count; i++) {
    const avatar = i < unused.length ? unused[i] : AVATARS[(i - unused.length) % AVATARS.length];
    const color = COLOR_KEYS[(taken.length + i) % COLOR_KEYS.length];
    picks.push({ avatar, color });
  }
  return picks;
}
