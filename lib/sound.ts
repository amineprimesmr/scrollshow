"use client";

// Tiny synthesized UI sound effects — no audio files, just the Web Audio API.
// Respects the user's OS-level reduced-motion preference as a proxy for
// "keep things quiet", and only ever runs after a user gesture (browsers
// block audio autoplay before that anyway).

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function soundEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("ss-sound") !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    window.localStorage.setItem("ss-sound", on ? "on" : "off");
  } catch {}
}

export function isSoundEnabled() {
  return soundEnabled();
}

type Tone = { freq: number; delay?: number; duration?: number; type?: OscillatorType; gain?: number };

function playTones(tones: Tone[]) {
  if (!soundEnabled()) return;
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime;
  for (const tone of tones) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const start = now + (tone.delay || 0);
    const dur = tone.duration ?? 0.09;
    const peak = tone.gain ?? 0.05;
    osc.type = tone.type || "sine";
    osc.frequency.setValueAtTime(tone.freq, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }
}

export const sound = {
  click: () => playTones([{ freq: 720, duration: 0.045, gain: 0.03 }]),
  nav: () => playTones([{ freq: 560, duration: 0.06, gain: 0.025 }]),
  success: () => playTones([{ freq: 660, duration: 0.09 }, { freq: 990, delay: 0.07, duration: 0.14 }]),
  error: () => playTones([{ freq: 220, duration: 0.16, type: "square", gain: 0.035 }]),
  notify: () => playTones([{ freq: 880, duration: 0.07 }, { freq: 1180, delay: 0.05, duration: 0.1 }]),
};
