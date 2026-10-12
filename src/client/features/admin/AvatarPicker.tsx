import { COLOR_KEYS, COLORS, type ColorKey } from "@shared/palette.ts";
import { CheckIcon } from "../../components/icons.tsx";
import { Avatar } from "../../components/ui/Avatar.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { Modal } from "../../components/ui/Modal.tsx";
import { cx } from "../../lib/cx.ts";

export interface Look {
  emoji: string;
  color: ColorKey;
}

export interface LookPickerProps {
  emojis: readonly string[];
  value: Look;
  onChange(look: Look): void;
  /** Emoji someone else already wears: still allowed, but faded. */
  taken?: ReadonlySet<string>;
}

/** An emoji grid and the colour swatches. */
export function LookPicker({ emojis, value, onChange, taken }: LookPickerProps) {
  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 font-display text-lg font-semibold text-forest">Picture</legend>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1.5">
          {emojis.map((e) => {
            const selected = e === value.emoji;
            const used = !selected && taken?.has(e);
            return (
              <button
                key={e}
                type="button"
                aria-pressed={selected}
                aria-label={used ? `${e} (already used)` : e}
                onClick={() => onChange({ ...value, emoji: e })}
                className={cx(
                  "flex size-14 select-none items-center justify-center justify-self-center rounded-2xl text-3xl leading-none transition-colors",
                  selected ? "bg-sprout-soft ring-4 ring-leaf" : "hover:bg-mint active:bg-mint-deep",
                  used && "opacity-40",
                )}
              >
                <span aria-hidden="true">{e}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-display text-lg font-semibold text-forest">Colour</legend>
        <div className="flex flex-wrap gap-2">
          {COLOR_KEYS.map((c) => {
            const selected = c === value.color;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={selected}
                aria-label={c}
                title={c}
                onClick={() => onChange({ ...value, color: c })}
                className={cx(
                  "flex size-14 items-center justify-center rounded-full border-4 transition-transform",
                  selected ? "scale-105 shadow-[0_0_0_3px_white,0_0_0_6px_var(--color-forest)]" : "hover:scale-105",
                )}
                style={{ backgroundColor: COLORS[c].bg, borderColor: COLORS[c].ring }}
              >
                {selected && <CheckIcon size={24} className="text-forest" />}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

export interface AvatarPickerProps extends LookPickerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Whose look this is, e.g. the student's name. */
  name: string;
}

/** A dialog to change a student's (or subject's) emoji and colour. Each tap saves. */
export function AvatarPicker({ open, onOpenChange, name, ...picker }: AvatarPickerProps) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`Pick a look for ${name}`} wide>
      <div className="mb-5 flex items-center gap-4 rounded-card bg-mint p-4">
        <Avatar emoji={picker.value.emoji} color={picker.value.color} size="xl" />
        <span className="min-w-0 truncate font-display text-[1.75rem] font-semibold text-ink">{name}</span>
      </div>
      <LookPicker {...picker} />
      <div className="mt-6 flex justify-end">
        <Button onClick={() => onOpenChange(false)} className="min-w-36">
          Done
        </Button>
      </div>
    </Modal>
  );
}
