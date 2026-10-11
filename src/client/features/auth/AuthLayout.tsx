import type { ReactNode } from "react";
import { Mascot, type MascotMood } from "../../components/Mascot.tsx";
import { CenteredScreen } from "../../components/layout/CenteredScreen.tsx";
import { Card } from "../../components/ui/Card.tsx";
import { cx } from "../../lib/cx.ts";

export interface AuthLayoutProps {
  mood: MascotMood;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Under the card, e.g. "Forgot password?". */
  footer?: ReactNode;
  /** Above the title, e.g. the wizard's steps. */
  header?: ReactNode;
  wide?: boolean;
}

/** The friendly centred card with Sprout peeking over the top (spec §8.2). */
export function AuthLayout({ mood, title, subtitle, children, footer, header, wide = false }: AuthLayoutProps) {
  return (
    <CenteredScreen>
      <div className={cx("w-full", wide ? "max-w-2xl" : "max-w-md")}>
        <p className="mb-1 text-center font-display text-lg font-semibold tracking-wide text-leaf-deep">Class Points</p>
        <div className="relative z-10 -mb-9 flex justify-center">
          <Mascot mood={mood} size={124} />
        </div>
        <Card className="px-5! pb-7! pt-12! sm:px-9!">
          {header}
          <h1 className="text-center text-3xl sm:text-[2.125rem]">{title}</h1>
          {subtitle && <p className="mt-2 text-center text-lg text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </Card>
        {footer && <div className="mt-4 flex justify-center">{footer}</div>}
      </div>
    </CenteredScreen>
  );
}
