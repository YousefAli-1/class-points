import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "../../lib/cx.ts";
import { BUTTON_VARIANTS, type ButtonVariant } from "./styles.ts";
import { Spinner } from "./Spinner.tsx";

export type ButtonSize = "md" | "lg" | "xl";

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-14 gap-2 rounded-btn px-5 text-xl",
  lg: "min-h-16 gap-2.5 rounded-[1.25rem] px-7 text-2xl",
  xl: "min-h-20 gap-3 rounded-blob px-9 text-[1.75rem]",
};

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
};

/** The chunky button: it sits on a darker edge and presses into it by 2px when tapped. */
export function Button({
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled,
  type = "button",
  className,
  children,
  ...rest
}: ButtonProps) {
  const lead = loading ? <Spinner size={size === "md" ? 22 : 26} /> : icon;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "inline-flex select-none items-center justify-center text-center font-display font-bold leading-tight",
        "disabled:cursor-not-allowed disabled:opacity-50",
        SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {lead && (
        <span aria-hidden={loading ? undefined : true} className="inline-flex shrink-0 items-center">
          {lead}
        </span>
      )}
      {children}
    </button>
  );
}
