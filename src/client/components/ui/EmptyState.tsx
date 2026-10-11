import type { ReactNode } from "react";
import { Mascot, type MascotMood } from "../Mascot.tsx";

export interface EmptyStateProps {
  mood?: MascotMood;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

/** Sprout with a short, kind message and an optional next step. */
export function EmptyState({ mood = "happy", title, children, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <Mascot mood={mood} size={136} />
      <h2 className="mt-1 text-2xl sm:text-[1.75rem]">{title}</h2>
      {children && <div className="max-w-md text-lg text-muted">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
