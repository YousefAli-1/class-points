import type { ReactNode } from "react";
import { useSaveQueue } from "../../lib/SaveQueueProvider.tsx";
import { cx } from "../../lib/cx.ts";
import { AlertIcon, CheckIcon, CloudOffIcon } from "../icons.tsx";

/** A cloud with two arrows going round inside it (still when reduced motion is on). */
function SyncCloud() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path
        d="M7.5 20h11.2a4.3 4.3 0 0 0 .7-8.55A6.4 6.4 0 0 0 7.1 9.8 5.1 5.1 0 0 0 7.5 20z"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <g className="motion-safe:animate-spin" style={{ transformOrigin: "13px 14.5px", animationDuration: "1.4s" }}>
        <path d="M10.2 13.2a3 3 0 0 1 5-1.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M15.8 15.8a3 3 0 0 1-5 1.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

const PILL = "inline-flex min-h-14 shrink-0 items-center gap-2 rounded-full px-3.5 font-display text-base font-semibold sm:px-4";

function Pill({ tone, icon, text }: { tone: string; icon: ReactNode; text: string }) {
  return (
    <span className={cx(PILL, tone)} title={text}>
      <span className="inline-flex" aria-hidden="true">
        {icon}
      </span>
      {/* Text is visible from tablet width; on a phone the icon stands in and the label stays for screen readers. */}
      <span className="sr-only sm:not-sr-only">{text}</span>
    </span>
  );
}

/** Whether every tap reached the server (spec §8.1). */
export function SaveIndicator() {
  const { state, retryNow } = useSaveQueue();

  return (
    <div role="status" aria-live="polite" className="flex shrink-0">
      {state === "saved" && (
        <Pill tone="bg-sprout-soft text-leaf-deep" icon={<CheckIcon size={22} />} text="All saved" />
      )}
      {state === "saving" && <Pill tone="bg-white text-forest ring-2 ring-line" icon={<SyncCloud />} text="Saving…" />}
      {state === "offline" && (
        <Pill
          tone="bg-sunshine-soft text-ink ring-2 ring-sunshine"
          icon={<CloudOffIcon size={22} />}
          text="Offline: will save when back"
        />
      )}
      {state === "error" && (
        <button
          type="button"
          onClick={retryNow}
          title="Couldn't save, retrying. Tap to retry now."
          className={cx(PILL, "chunky bg-card-red-soft text-card-red-deep ring-2 ring-card-red/40 [--edge:var(--color-card-red)]")}
        >
          <AlertIcon size={22} />
          <span className="sr-only sm:not-sr-only">Couldn&rsquo;t save, retrying</span>
          <span className="rounded-full bg-white px-2.5 py-1 text-sm font-bold">Retry</span>
        </button>
      )}
    </div>
  );
}
