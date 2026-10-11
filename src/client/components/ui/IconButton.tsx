import type { ComponentPropsWithRef, ReactNode } from "react";
import { cx } from "../../lib/cx.ts";
import { BUTTON_VARIANTS, type ButtonVariant } from "./styles.ts";

export type IconButtonProps = ComponentPropsWithRef<"button"> & {
  /** Read by screen readers and shown as a tooltip. */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: "md" | "lg";
};

/** A round button with just an icon. 56px (md) or 64px (lg) across. */
export function IconButton({
  label,
  icon,
  variant = "secondary",
  size = "md",
  type = "button",
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full",
        "disabled:cursor-not-allowed disabled:opacity-45",
        size === "md" ? "size-14" : "size-16",
        BUTTON_VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className="inline-flex">
        {icon}
      </span>
    </button>
  );
}
