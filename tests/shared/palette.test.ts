import { describe, expect, it } from "vitest";
import {
  AVATARS,
  COLORS,
  COLOR_KEYS,
  DEFAULT_SUBJECTS,
  SUBJECT_EMOJIS,
  THEME,
  pickAvatars,
} from "@shared/palette.ts";

describe("palette", () => {
  it("AVATARS has 40 unique", () => {
    expect(AVATARS).toHaveLength(40);
    expect(new Set(AVATARS).size).toBe(40);
    expect(AVATARS.slice(0, 3)).toEqual(["🦊", "🐼", "🐸"]);
  });

  it("pickAvatars skips taken and cycles", () => {
    // Unused avatars come first, in list order; colours start at taken.length % 10.
    expect(pickAvatars(3, ["🐼"])).toEqual([
      { avatar: "🦊", color: COLOR_KEYS[1] },
      { avatar: "🐸", color: COLOR_KEYS[2] },
      { avatar: AVATARS[3], color: COLOR_KEYS[3] },
    ]);

    // Taken emoji that are not in AVATARS (custom picks) block nothing but still shift the colour.
    expect(pickAvatars(1, ["⭐", "🦊"])).toEqual([{ avatar: "🐼", color: COLOR_KEYS[2] }]);

    // When the unused ones run out, it cycles from the start of the list.
    const allButLast = AVATARS.slice(0, 39);
    expect(pickAvatars(3, allButLast).map((p) => p.avatar)).toEqual([AVATARS[39], AVATARS[0], AVATARS[1]]);

    // Colours wrap around COLOR_KEYS.
    const picks = pickAvatars(12, AVATARS);
    expect(picks.map((p) => p.avatar)).toEqual(AVATARS.slice(0, 12));
    expect(picks.map((p) => p.color)).toEqual([...COLOR_KEYS, COLOR_KEYS[0], COLOR_KEYS[1]]);

    expect(pickAvatars(0, [])).toEqual([]);
  });

  it("colour and subject tables are complete", () => {
    for (const key of COLOR_KEYS) {
      expect(COLORS[key].bg).toMatch(/^#[0-9A-F]{6}$/);
      expect(COLORS[key].ring).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(THEME.forest).toBe("#14532D");
    expect(THEME.cardRed).toBe("#E5383B");

    expect(SUBJECT_EMOJIS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(SUBJECT_EMOJIS).size).toBe(SUBJECT_EMOJIS.length);
    expect(SUBJECT_EMOJIS).toEqual(expect.arrayContaining(["📚", "🔢", "🔬"]));

    expect(DEFAULT_SUBJECTS).toEqual([
      { name: "English", emoji: "📚", color: "sky" },
      { name: "Mathematics", emoji: "🔢", color: "sunshine" },
      { name: "Science", emoji: "🔬", color: "leaf" },
    ]);
  });
});
