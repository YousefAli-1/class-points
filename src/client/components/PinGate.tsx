import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api.ts";
import { formatCountdown } from "../lib/format.ts";
import { friendlyErrorMessage } from "../lib/queryClient.ts";
import { qk } from "../lib/queryKeys.ts";
import { useSound } from "../lib/sound.ts";
import { Mascot, type MascotMood } from "./Mascot.tsx";
import { PinPad } from "./PinPad.tsx";
import { Card } from "./ui/Card.tsx";

export interface PinGateProps {
  title: string;
  subtitle?: string;
  onUnlocked?(): void;
}

type Feedback = { kind: "wrong" } | { kind: "error"; message: string } | null;

/** The PIN pad in a card: unlocks admin for 10 minutes. Shows a countdown while too many tries lock it. */
export function PinGate({ title, subtitle, onUnlocked }: PinGateProps) {
  const qc = useQueryClient();
  const play = useSound();
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockLeftMs, setLockLeftMs] = useState(0);

  useEffect(() => {
    if (lockedUntil === null) return;
    const timer = setInterval(() => {
      const left = lockedUntil - Date.now();
      if (left > 0) {
        setLockLeftMs(left);
      } else {
        setLockedUntil(null);
        setLockLeftMs(0);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  function change(next: string) {
    setPin(next);
    if (feedback) setFeedback(null);
  }

  async function submit(entered: string) {
    if (checking) return;
    setChecking(true);
    try {
      await api.unlock(entered);
      play("ding");
      await qc.invalidateQueries({ queryKey: qk.auth });
      onUnlocked?.();
    } catch (error) {
      setPin("");
      if (error instanceof ApiError && error.code === "RATE_LIMITED") {
        const wait = error.retryAfterMs ?? 60_000;
        setLockedUntil(Date.now() + wait);
        setLockLeftMs(wait);
        setFeedback(null);
      } else if (error instanceof ApiError && error.status === 401) {
        setFeedback({ kind: "wrong" });
        setShakeKey((k) => k + 1);
        play("nope");
        // The same 401 also means "logged out": re-checking sends her to the login page if so.
        void qc.invalidateQueries({ queryKey: qk.auth });
      } else {
        setFeedback({ kind: "error", message: friendlyErrorMessage(error) });
      }
    } finally {
      setChecking(false);
    }
  }

  const locked = lockedUntil !== null;
  const mood: MascotMood = locked ? "sleep" : feedback?.kind === "wrong" ? "think" : "happy";

  return (
    <Card className="mx-auto flex w-full max-w-md flex-col items-center px-6! py-7! text-center">
      <Mascot mood={mood} size={80} />
      <h2 className="mt-3 text-[1.75rem] sm:text-3xl">{title}</h2>
      {subtitle && <p className="mt-1 text-lg text-muted">{subtitle}</p>}

      <div className="mb-3 mt-2 flex min-h-14 items-center justify-center" aria-live="polite">
        {locked ? (
          <p className="rounded-2xl bg-sunshine-soft px-4 py-2 text-lg font-bold text-honey-deep">
            Too many tries. Try again in <span className="tabular-nums">{formatCountdown(lockLeftMs)}</span>
          </p>
        ) : feedback?.kind === "wrong" ? (
          <p className="text-lg font-bold text-honey-deep">Not quite, try again</p>
        ) : feedback?.kind === "error" ? (
          <p className="text-lg font-bold text-honey-deep">{feedback.message}</p>
        ) : (
          <p className="text-lg text-muted">{checking ? "Checking…" : "Tap your 4 to 6 digit PIN"}</p>
        )}
      </div>

      <PinPad
        value={pin}
        onChange={change}
        onSubmit={(entered) => void submit(entered)}
        disabled={checking || locked}
        wrong={feedback?.kind === "wrong"}
        shakeKey={shakeKey}
      />
    </Card>
  );
}
