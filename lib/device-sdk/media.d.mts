import type { Identity } from "./index.mjs";
export function streamMedia(
  origin: string,
  self: Identity,
  device: string,
  kind: "video" | "microphone",
  seconds?: number,
  signal?: AbortSignal,
): AsyncGenerator<{
  kind: "video" | "microphone";
  sequence: number;
  bytes: Buffer;
}>;
export function wav(pcm: Buffer): Buffer;

export declare const mediaFormats: Readonly<
  Record<"video" | "microphone", { mime: string; maxBytes: number }>
>;
