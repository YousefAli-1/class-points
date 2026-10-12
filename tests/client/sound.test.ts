import { afterEach, describe, expect, it, vi } from "vitest";

/** An AudioContext that starts suspended and only runs once `resume()` is allowed to work. */
function fakeContext() {
  const calls = { resume: 0, silentStarts: 0 };
  let resumeWorks = false;
  class FakeAudioContext {
    state: AudioContextState = "suspended";
    currentTime = 0;
    sampleRate = 44_100;
    destination = {};
    createGain() {
      return { gain: { value: 0 }, connect: (next: unknown) => next };
    }
    createBuffer(_channels: number, length: number) {
      return { length };
    }
    createBufferSource() {
      return {
        buffer: null as unknown,
        connect: (next: unknown) => next,
        start() {
          calls.silentStarts++;
        },
      };
    }
    resume() {
      calls.resume++;
      if (resumeWorks) this.state = "running";
      return Promise.resolve();
    }
  }
  return {
    FakeAudioContext,
    calls,
    allowResume: () => {
      resumeWorks = true;
    },
  };
}

const gesture = (type: string) => window.dispatchEvent(new Event(type));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("audio unlock", () => {
  it("unlock listeners stay until the context is running", async () => {
    const { FakeAudioContext, calls, allowResume } = fakeContext();
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const removed = vi.spyOn(window, "removeEventListener");
    await import("@client/lib/sound.ts");

    // iPad Safari: early gestures don't count as user activation, so the context stays suspended.
    gesture("pointerup");
    await flush();
    gesture("touchend");
    await flush();
    expect(calls.resume).toBe(2);
    expect(calls.silentStarts).toBe(2); // a 1-sample silent buffer on each try
    expect(removed.mock.calls.map(([type]) => type)).not.toContain("touchend");

    // A real activation: resume works and the listeners go.
    allowResume();
    gesture("click");
    await flush();
    expect(calls.resume).toBe(3);
    expect(removed.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(["pointerup", "touchend", "click", "keydown"]),
    );

    // Gone for good: later gestures no longer try to unlock.
    gesture("keydown");
    gesture("pointerup");
    await flush();
    expect(calls.resume).toBe(3);
  });

  it("keydown counts as a gesture too", async () => {
    const { FakeAudioContext, calls, allowResume } = fakeContext();
    vi.stubGlobal("AudioContext", FakeAudioContext);
    allowResume();
    await import("@client/lib/sound.ts");

    gesture("keydown");
    await flush();

    expect(calls.resume).toBe(1);
  });
});
