import type { ComponentPropsWithRef } from "react";
import { cx } from "../../lib/cx.ts";

/** A soft white panel. Add classes with `className`; override padding with `p-0!`. */
export function Card({ className, ...rest }: ComponentPropsWithRef<"div">) {
  return (
    <div
      className={cx("rounded-card bg-white p-5 shadow-soft ring-1 ring-line/70 sm:p-6", className)}
      {...rest}
    />
  );
}
