import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Bootstrap } from "@shared/types.ts";
import { qk } from "@client/lib/queryKeys.ts";
import { useSound, useSoundPref } from "@client/lib/sound.ts";

/** Just enough of Web Audio to count the notes played. */
function fakeAudioContext() {
  const oscillators: unknown[] = [];
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect: (next: unknown) => next });
  class FakeAudioContext {
    state = "running";
    currentTime = 0;
    sampleRate = 44_100;
    destination = node();
    createGain() {
      return { ...node(), gain: param() };
    }
    createOscillator() {
      const osc = { ...node(), type: "sine", frequency: param(), start() {}, stop() {} };
      oscillators.push(osc);
      return osc;
    }
    resume() {
      return Promise.resolve();
    }
  }
  return { FakeAudioContext, oscillators };
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("sound preference", () => {
  it("follows the class setting until this device chooses, then remembers the choice", () => {
    const { FakeAudioContext, oscillators } = fakeAudioContext();
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const qc = new QueryClient();
    qc.setQueryData(qk.bootstrap, { settings: { soundOn: false } } as Bootstrap);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => ({ pref: useSoundPref(), play: useSound() }), { wrapper });

    expect(result.current.pref[0]).toBe(false);
    act(() => result.current.play("boop"));
    expect(oscillators).toHaveLength(0); // muted: nothing plays

    act(() => result.current.pref[1]());
    expect(result.current.pref[0]).toBe(true);
    expect(localStorage.getItem("cp.sound")).toBe("on");
    const afterToggle = oscillators.length; // turning sound on plays a little "pop"
    expect(afterToggle).toBeGreaterThan(0);

    act(() => result.current.play("boop"));
    expect(oscillators.length).toBeGreaterThan(afterToggle);

    act(() => result.current.pref[1]());
    expect(result.current.pref[0]).toBe(false);
    expect(localStorage.getItem("cp.sound")).toBe("off");
  });
});
