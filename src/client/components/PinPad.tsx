import { useEffect, useRef } from "react";
import { cx } from "../lib/cx.ts";
import { BackspaceIcon } from "./icons.tsx";

const MIN_DIGITS = 4;
const MAX_DIGITS = 6;

export interface PinPadProps {
  value: string;
  onChange(value: string): void;
  /** Called with the PIN at 6 digits (automatically) or on OK with 4–5. */
  onSubmit(pin: string): void;
  disabled?: boolean;
  /** The last try was wrong: the dots shake (colour only with reduced motion). */
  wrong?: boolean;
  /** Change it to replay the shake. */
  shakeKey?: number;
}

/*
 * Mirroring safety (spec §5): the screen may be shared with the class, so the pad shows filled dots
 * only, never digits, and its keys have no pressed, hover or focus highlight, animation or sound.
 * Keyboard users see the focus ring around the whole pad instead of on one key.
 */
const KEY_CLASS = cx(
  "chunky-still flex aspect-square w-full select-none items-center justify-center rounded-full",
  "font-display text-[1.875rem] font-semibold leading-none focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-40",
);

const PAD_CLASS = cx(
  "grid w-full max-w-[16rem] grid-cols-3 gap-4 rounded-[2rem]",
  "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-8 has-[:focus-visible]:outline-forest",
);

/** Typing in these keeps its usual meaning: the pad only listens when nothing else wants the key. */
const OTHER_CONTROLS = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable=false])",
  "button",
  "a[href]",
  "summary",
  "[role=button]",
  "[role=link]",
  "[role=menuitem]",
  "[role=option]",
  "[role=tab]",
  "[role=checkbox]",
  "[role=radio]",
  "[role=switch]",
  "[role=slider]",
  "[role=textbox]",
  "[role=combobox]",
].join(",");

export function PinPad({ value, onChange, onSubmit, disabled = false, wrong = false, shakeKey = 0 }: PinPadProps) {
  const canSubmit = !disabled && value.length >= MIN_DIGITS;
  const padRef = useRef<HTMLDivElement>(null);

  function addDigit(d: string) {
    if (disabled || value.length >= MAX_DIGITS) return;
    const next = value + d;
    onChange(next);
    if (next.length === MAX_DIGITS) onSubmit(next);
  }

  function removeDigit() {
    if (!disabled) onChange(value.slice(0, -1));
  }

  function submit() {
    if (canSubmit) onSubmit(value);
  }

  // A laptop keyboard works too, while focus is on the page itself or inside the pad. Nothing on
  // screen reacts to which key was pressed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const target = e.target;
      const inPad = target instanceof Node && padRef.current?.contains(target);
      if (!inPad && target instanceof Element && target.closest(OTHER_CONTROLS)) return;
      if (/^\d$/.test(e.key)) addDigit(e.key);
      else if (e.key === "Backspace") removeDigit();
      else if (e.key === "Enter") submit();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div ref={padRef} className="flex w-full flex-col items-center gap-6">
      <div
        key={shakeKey}
        data-testid="pin-dots"
        className={cx("flex items-center gap-3", wrong && "motion-safe:animate-shake")}
      >
        {Array.from({ length: MAX_DIGITS }, (_, i) => {
          const filled = i < value.length;
          const optional = i >= MIN_DIGITS;
          return (
            <span
              key={i}
              data-filled={filled}
              className={cx(
                "size-5 rounded-full border-[3px] transition-colors",
                filled
                  ? wrong
                    ? "border-honey bg-honey"
                    : "border-leaf-deep bg-leaf"
                  : wrong
                    ? "border-honey"
                    : "border-line-deep",
                !filled && optional && "border-dashed opacity-70",
              )}
            />
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {value.length === 0 ? "No digits entered" : `${value.length} digits entered`}
      </p>

      <div role="group" aria-label="PIN keys" className={PAD_CLASS}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            disabled={disabled}
            onClick={() => addDigit(d)}
            className={cx(KEY_CLASS, "bg-white text-forest ring-2 ring-line [--edge:var(--color-line-deep)]")}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          aria-label="Delete last digit"
          disabled={disabled || value.length === 0}
          onClick={removeDigit}
          className={cx(KEY_CLASS, "bg-mint-deep text-forest [--edge:var(--color-line-deep)]")}
        >
          <BackspaceIcon size={30} />
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => addDigit("0")}
          className={cx(KEY_CLASS, "bg-white text-forest ring-2 ring-line [--edge:var(--color-line-deep)]")}
        >
          0
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className={cx(KEY_CLASS, "bg-leaf text-[1.6rem] font-bold text-white [--edge:var(--color-leaf-deep)]")}
        >
          OK
        </button>
      </div>
    </div>
  );
}
