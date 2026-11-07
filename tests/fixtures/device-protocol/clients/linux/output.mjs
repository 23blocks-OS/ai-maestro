import {
  playArgs,
  playCommand,
  playPresent,
  speechArgs,
  speechCommand,
  speechPresent,
} from "./platform.mjs";
import { spawn } from "node:child_process";
export function speechReady() {
  return speechPresent();
}
export function say(text, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(speechCommand, speechArgs, {
      stdio: ["pipe", "ignore", "ignore"],
    });
    const stop = () => child.kill("SIGKILL");
    const timer = setTimeout(stop, 10000);
    signal?.addEventListener("abort", stop, { once: true });
    child.stdin.on("error", () => {});
    child.stdin.end(text);
    child.once("error", finish);
    child.once("close", (code) =>
      finish(
        code === 0 && !signal?.aborted
          ? null
          : new Error("Speech unavailable or stopped"),
      ),
    );
    let done = false;
    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      error ? reject(error) : resolve({ played: true });
    }
    if (signal?.aborted) stop();
  });
}
export function playReady() {
  return playPresent();
}
export function play(bytes, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(playCommand, playArgs, {
      stdio: ["pipe", "ignore", "ignore"],
    });
    const stop = () => child.kill("SIGKILL");
    const timer = setTimeout(stop, 14000);
    signal?.addEventListener("abort", stop, { once: true });
    child.stdin.on("error", () => {});
    child.stdin.end(bytes);
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      error ? reject(error) : resolve({ played: true });
    };
    child.once("error", finish);
    child.once("close", (code) =>
      finish(
        code === 0 && !signal?.aborted
          ? null
          : new Error("Audio unavailable or stopped"),
      ),
    );
    if (signal?.aborted) stop();
  });
}

/** How loud 16-bit PCM is, 0..1. The root curve keeps quiet speech visible. */
export function loudness(pcm) {
  let sum = 0;
  const samples = pcm.length >> 1;
  for (let i = 0; i < samples; i++) sum += pcm.readInt16LE(i * 2) ** 2;
  return samples ? Math.min(1, Math.sqrt(Math.sqrt(sum / samples) / 32768) * 1.6) : 0;
}

const ENVELOPE_MS = 50;
/** Loudness of a 16-bit PCM WAV, one value per 50 ms. Empty when the file is anything else. */
export function envelope(bytes) {
  let format, data;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const size = bytes.readUInt32LE(at + 4);
    const id = bytes.toString("latin1", at, at + 4);
    if (id === "fmt " && size >= 16 && at + 24 <= bytes.length)
      format = {
        channels: bytes.readUInt16LE(at + 10),
        rate: bytes.readUInt32LE(at + 12),
        bits: bytes.readUInt16LE(at + 22),
      };
    // A piped WAV has no real size in its header, so take what is there
    if (id === "data") data = bytes.subarray(at + 8, at + 8 + size);
    if (data) break;
    at += 8 + size + (size % 2);
  }
  if (!data || format?.bits !== 16 || !format.rate || !format.channels) return [];
  const step = Math.max(
    2,
    Math.round((format.rate * format.channels * ENVELOPE_MS) / 1000) * 2,
  );
  const levels = [];
  for (let at = 0; at + 2 <= data.length; at += step)
    levels.push(loudness(data.subarray(at, at + step)));
  return levels;
}

/**
 * All agent speech goes through here, so the device knows what is really playing
 * and can stop it the moment a person starts to talk.
 */
export class Voice {
  constructor({ play: playAudio = play, say: sayText = say, now = Date.now } = {}) {
    Object.assign(this, { playAudio, sayText, now });
    this.sounds = new Set();
    this.hushed = false;
  }
  async #run(start, signal, levels) {
    if (this.hushed) return { played: false };
    const stop = new AbortController();
    const sound = { stop, levels, at: this.now() };
    this.sounds.add(sound);
    try {
      return await start(
        signal ? AbortSignal.any([signal, stop.signal]) : stop.signal,
      );
    } catch (error) {
      if (sound.silenced) return { played: false };
      throw error;
    } finally {
      this.sounds.delete(sound);
    }
  }
  play(bytes, signal) {
    return this.#run(
      (both) => this.playAudio(bytes, both),
      signal,
      envelope(bytes),
    );
  }
  say(text, signal) {
    return this.#run((both) => this.sayText(text, both), signal, []);
  }
  /** Stop what is playing now. */
  silence() {
    for (const sound of this.sounds) {
      sound.silenced = true;
      sound.stop.abort();
    }
  }
  /** Stop what is playing, and drop what arrives until release: the microphone must not pick her up. */
  hush() {
    this.hushed = true;
    this.silence();
  }
  release() {
    this.hushed = false;
  }
  speaking() {
    return this.sounds.size > 0;
  }
  level() {
    const sound = [...this.sounds].at(-1);
    if (!sound) return 0;
    // shortcut: espeak-ng plays straight to the sound card, so speaker.say has no samples to read and gets a steady level; upgrade by piping `espeak-ng --stdout` through play
    if (!sound.levels.length) return 0.5;
    return sound.levels[Math.floor((this.now() - sound.at) / ENVELOPE_MS)] ?? 0;
  }
}
