import { Link, useLocation } from "react-router";
import { useAuthStatus, useBootstrap } from "../../lib/queries.ts";
import { cx } from "../../lib/cx.ts";
import { useSoundPref } from "../../lib/sound.ts";
import { SpeakerOffIcon, SpeakerOnIcon } from "../icons.tsx";
import { Mascot } from "../Mascot.tsx";
import { IconButton } from "../ui/IconButton.tsx";
import { SaveIndicator } from "./SaveIndicator.tsx";

interface NavItem {
  to: string;
  emoji: string;
  label: string;
  isActive(pathname: string): boolean;
}

function NavPill({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.isActive(pathname);
  return (
    <Link
      to={item.to}
      aria-current={active ? "page" : undefined}
      className={cx(
        // On a phone the emoji sits above the label so all three fit; from tablet width they share a row.
        "inline-flex min-h-14 min-w-0 flex-1 select-none flex-col items-center justify-center rounded-full px-2",
        "sm:flex-row sm:gap-2 sm:px-4 lg:flex-none lg:px-5",
        "font-display text-sm font-semibold whitespace-nowrap sm:text-lg",
        active
          ? "chunky bg-forest text-white [--edge:var(--color-forest-deep)]"
          : "text-forest hover:bg-mint active:bg-mint-deep",
      )}
    >
      <span aria-hidden="true" className="text-xl leading-none">
        {item.emoji}
      </span>
      {item.label}
    </Link>
  );
}

/** Sprout and the class name, the three nav pills, the save indicator and the sound toggle (spec §8.1). */
export function TopBar() {
  const { pathname } = useLocation();
  const className = useBootstrap().data?.settings.className;
  const adminUnlocked = useAuthStatus().data?.adminUnlocked === true;
  const [soundOn, toggleSound] = useSoundPref();

  const nav: NavItem[] = [
    { to: "/", emoji: "📅", label: "Calendar", isActive: (p) => p === "/" || p.startsWith("/day/") },
    { to: "/reports", emoji: "📊", label: "Reports", isActive: (p) => p.startsWith("/reports") },
    { to: "/admin", emoji: adminUnlocked ? "🔓" : "🔒", label: "Admin", isActive: (p) => p.startsWith("/admin") },
  ];

  return (
    <header data-print-hide className="relative z-20 px-safe pt-safe">
      <div
        className={cx(
          "mx-auto mt-2 flex max-w-[90rem] flex-wrap items-center gap-x-2 gap-y-1.5 rounded-blob p-1.5 pl-2.5",
          "bg-white/85 shadow-soft ring-1 ring-white backdrop-blur-md lg:flex-nowrap",
        )}
      >
        <Link to="/" className="flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-full pr-2 lg:flex-none">
          <Mascot size={46} mood="happy" />
          <span className="truncate font-display text-xl font-semibold text-forest lg:max-w-64">
            {className ?? "Class Points"}
          </span>
        </Link>

        <nav aria-label="Main" className="order-last flex w-full gap-1.5 lg:order-none lg:w-auto lg:flex-1 lg:justify-center">
          {nav.map((item) => (
            <NavPill key={item.to} item={item} pathname={pathname} />
          ))}
        </nav>

        <SaveIndicator />
        <IconButton
          label="Sounds"
          aria-pressed={soundOn}
          icon={soundOn ? <SpeakerOnIcon /> : <SpeakerOffIcon />}
          variant="ghost"
          onClick={toggleSound}
          className={soundOn ? undefined : "text-muted"}
        />
      </div>
    </header>
  );
}
