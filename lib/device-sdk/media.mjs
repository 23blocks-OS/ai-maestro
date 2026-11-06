import { nonce, privateOrigin, open, seal } from "./index.mjs";

export const mediaFormats = Object.freeze({
  video: { mime: "image/jpeg", maxBytes: 512 * 1024 },
  microphone: {
    mime: "audio/pcm;format=s16le;rate=16000;channels=1",
    maxBytes: 3200,
  },
});

export async function* streamMedia(
  origin,
  self,
  device,
  kind,
  seconds = 10,
  signal,
) {
  if (
    !["video", "microphone"].includes(kind) ||
    !Number.isInteger(seconds) ||
    seconds < 1 ||
    seconds > 60
  )
    throw new Error("Invalid media request");
  if (typeof origin !== "string")
    throw new Error(
      "Live media over outbound connections is not supported by this profile; use snapshots",
    );
  const base = privateOrigin(origin);
  const deadline = AbortSignal.timeout((seconds + 10) * 1000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const options = { signal: combined, redirect: "error" };
  const hello = await fetch(base + "/v1/challenge", options);
  if (!hello.ok) throw new Error("Challenge HTTP " + hello.status);
  const { challenge } = await hello.json();
  if (!/^[a-f0-9]{48}$/.test(challenge)) throw new Error("Invalid challenge");
  const id = nonce();
  const response = await fetch(base + "/v1/request", {
    ...options,
    method: "POST",
    body: JSON.stringify(
      seal(
        {
          id,
          challenge,
          to: device,
          type: "media",
          kind,
          seconds,
          format: mediaFormats[kind].mime,
        },
        self.secret,
      ),
    ),
  });
  if (!response.ok) throw new Error("Media HTTP " + response.status);
  let pending = Buffer.alloc(0),
    sequence = 0,
    finished = false;
  try {
    for await (const chunk of response.body) {
      pending = Buffer.concat([pending, chunk]);
      let newline;
      while ((newline = pending.indexOf(10)) >= 0) {
        if (newline > 1000000) throw new Error("Media packet too large");
        const packet = JSON.parse(pending.subarray(0, newline).toString());
        pending = pending.subarray(newline + 1);
        const event = open(packet, device);
        if (
          event.id !== id ||
          event.challenge !== challenge ||
          event.to !== self.key ||
          event.sequence !== sequence++ ||
          event.kind !== kind
        )
          throw new Error("Invalid media correlation");
        if (event.type === "media.end") {
          if (event.reason !== "completed")
            throw new Error("Media ended: " + event.reason);
          finished = true;
          return;
        }
        if (event.type !== "media.frame" || typeof event.data !== "string")
          throw new Error("Invalid media frame");
        const bytes = Buffer.from(event.data, "base64");
        if (bytes.length > (kind === "video" ? 512 * 1024 : 3200))
          throw new Error("Media frame too large");
        yield { kind, sequence: event.sequence, bytes };
      }
      if (pending.length > 1000000) throw new Error("Media packet too large");
    }
    if (!finished) throw new Error("Media disconnected before completion");
  } finally {
    if (!response.body.locked) await response.body.cancel().catch(() => {});
  }
}
export function wav(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(pcm.length + 36, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24);
  header.writeUInt32LE(32000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
