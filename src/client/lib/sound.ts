import { useQuery } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import type { Bootstrap } from "@shared/types.ts";
import { api } from "./api.ts";
import { qk } from "./queryKeys.ts";

// Short, cute sounds synthesised with Web Audio, so there are no audio files to load (spec §2.9).

export type SoundName = "pop" | "boop" | "ding" | "sparkle" | "nope" | "whoosh";

/** Per-device preference. It overrides the class-wide `settings.soundOn` once she touches the toggle. */
const PREF_KEY = "cp.sound";
const VOLUME = 0.32;

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;
let output: GainNode | null = null;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (context && output) return { ctx: context, out: output };
  if (typeof window === "undefined") return null;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  output = context.createGain();
  output.gain.value = VOLUME;
  output.connect(context.destination);
  return { ctx: context, out: output };
}

/** iPad Safari only counts the end of a touch (or a click or key press) as a user activation, not `pointerdown`. */
const UNLOCK_EVENTS = ["pointerup", "touchend", "click", "keydown"] as const;

/** Playing a one-sample silent buffer inside a gesture is what finally wakes audio on iOS. */
function playSilence(ctx: AudioContext): void {
  const source = ctx.createBufferSource();
  source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  source.connect(ctx.destination);
  source.start(0);
}

/**
 * Browsers (iPad Safari above all) only let audio start inside a user gesture, so the context is
 * created and resumed on a tap or key press rather than when the page loads. Every gesture tries
 * again until the context is actually running.
 */
function unlockOnGesture(): void {
  if (typeof window === "undefined") return;
  const stop = () => {
    for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true);
  };
  const stopIfRunning = (ctx: AudioContext) => {
    if (ctx.state === "running") stop();
  };
  function unlock() {
    const a = audio();
    if (!a) return;
    try {
      playSilence(a.ctx);
    } catch {
      // Not fatal: resume() alone is enough in most browsers.
    }
    a.ctx.resume().then(
      () => stopIfRunning(a.ctx),
      () => {},
    );
    stopIfRunning(a.ctx);
  }
  for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, true);
}

unlockOnGesture();

interface Note {
  type: OscillatorType;
  /** Hz at the start, and optionally where it glides to. */
  from: number;
  to?: number;
  /** Seconds after "now". */
  at?: number;
  dur: number;
  peak?: number;
}

function note(ctx: AudioContext, out: AudioNode, n: Note): void {
  const t0 = ctx.currentTime + (n.at ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = n.type;
  osc.frequency.setValueAtTime(n.from, t0);
  if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t0 + n.dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(n.peak ?? 0.8, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.dur);
  osc.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t0 + n.dur + 0.03);
}

/** A soft breath of filtered noise that sweeps upwards. */
function whoosh(ctx: AudioContext, out: AudioNode): void {
  const dur = 0.32;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.4;
  const t0 = ctx.currentTime;
  filter.frequency.setValueAtTime(350, t0);
  filter.frequency.exponentialRampToValueAtTime(2600, t0 + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.5, t0 + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  noise.connect(filter).connect(gain).connect(out);
  noise.start(t0);
  noise.stop(t0 + dur + 0.02);
}

const SOUNDS: Record<SoundName, (ctx: AudioContext, out: AudioNode) => void> = {
  // A bubble popping: a quick upward chirp.
  pop: (ctx, out) => note(ctx, out, { type: "sine", from: 420, to: 980, dur: 0.09, peak: 0.9 }),
  // A card going on: a round, bouncy "boop" that drops in pitch.
  boop: (ctx, out) => {
    note(ctx, out, { type: "triangle", from: 620, to: 330, dur: 0.16, peak: 0.9 });
    note(ctx, out, { type: "sine", from: 1240, to: 660, dur: 0.08, peak: 0.25 });
  },
  // A little bell.
  ding: (ctx, out) => {
    note(ctx, out, { type: "sine", from: 1318.5, dur: 0.7, peak: 0.7 });
    note(ctx, out, { type: "sine", from: 2637, dur: 0.35, peak: 0.18 });
  },
  // A rising chime: C6 E6 G6 C7.
  sparkle: (ctx, out) =>
    [1046.5, 1318.5, 1568, 2093].forEach((from, i) =>
      note(ctx, out, { type: "sine", from, at: i * 0.055, dur: 0.28, peak: 0.45 }),
    ),
  // A gentle "uh-uh": two soft low notes, never a buzzer.
  nope: (ctx, out) => {
    note(ctx, out, { type: "triangle", from: 392, to: 370, dur: 0.12, peak: 0.6 });
    note(ctx, out, { type: "triangle", from: 330, to: 294, at: 0.14, dur: 0.16, peak: 0.6 });
  },
  whoosh,
};

/** Plays a sound now, whatever the preference. Most callers want `useSound()` instead. */
export function playSound(name: SoundName): void {
  const a = audio();
  if (!a) return;
  try {
    if (a.ctx.state === "suspended") void a.ctx.resume().catch(() => {});
    SOUNDS[name](a.ctx, a.out);
  } catch {
    // Sound is a nicety: never let it break a tap.
  }
}

// The per-device preference, as a tiny external store so every toggle and hook stays in sync.

type DevicePref = "on" | "off" | null;
const prefListeners = new Set<() => void>();

function readDevicePref(): DevicePref {
  try {
    const value = window.localStorage.getItem(PREF_KEY);
    return value === "on" || value === "off" ? value : null;
  } catch {
    return null;
  }
}

let devicePref: DevicePref = typeof window === "undefined" ? null : readDevicePref();

function setDevicePref(value: "on" | "off"): void {
  devicePref = value;
  try {
    window.localStorage.setItem(PREF_KEY, value);
  } catch {
    // Blocked storage: the choice still holds for this visit.
  }
  for (const listener of prefListeners) listener();
}

function subscribePref(listener: () => void): () => void {
  prefListeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== PREF_KEY) return;
    devicePref = readDevicePref();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    prefListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const getDevicePref = () => devicePref;
const getServerPref = (): DevicePref => null;

/** `settings.soundOn` from the cached bootstrap. Reads the cache only: it never fetches by itself. */
function useClassSoundOn(): boolean | undefined {
  return useQuery({
    queryKey: qk.bootstrap,
    queryFn: () => api.bootstrap(),
    enabled: false,
    select: (b: Bootstrap) => b.settings.soundOn,
  }).data;
}

/** Whether sounds play on this device, and a toggle that remembers the choice on this device. */
export function useSoundPref(): [on: boolean, toggle: () => void] {
  const pref = useSyncExternalStore(subscribePref, getDevicePref, getServerPref);
  const classDefault = useClassSoundOn();
  const on = pref === null ? (classDefault ?? true) : pref === "on";
  const toggle = useCallback(() => {
    setDevicePref(on ? "off" : "on");
    if (!on) playSound("pop");
  }, [on]);
  return [on, toggle];
}

/** A `play(name)` that stays quiet while sound is off. */
export function useSound(): (name: SoundName) => void {
  const [on] = useSoundPref();
  return useCallback(
    (name: SoundName) => {
      if (on) playSound(name);
    },
    [on],
  );
}
