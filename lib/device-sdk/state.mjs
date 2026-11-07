import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { identity, nonce, publicKey } from "./index.mjs";

export const dir =
  process.env.ADP_HOME || join(homedir(), ".config", "ai-maestro-device");
export function self() {
  return JSON.parse(readFileSync(join(dir, "identity.json"), "utf8"));
}
export function peer() {
  return JSON.parse(readFileSync(join(dir, "peer.json"), "utf8"));
}
export function init(role = "device") {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    writeFileSync(join(dir, "identity.json"), JSON.stringify(identity()), {
      mode: 0o600,
      flag: "wx",
    });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
  const key = self().key;
  console.error(`${role === "agent" ? "Agent" : "Device"} public key (safe to share)
State directory: ${dir}
Fingerprint: ${fingerprint(key)}`);
  console.log(key);
}
export function pair(key, { camera = false, assignedAgent } = {}) {
  publicKey(key);
  self();
  if (assignedAgent) {
    let current;
    try {
      current = peer();
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (
      current?.assignedAgent &&
      current.assignedAgent !== assignedAgent &&
      current.key === key
    )
      throw new Error("Transfer requires the new agent's own public key");
  }
  const temp = join(dir, nonce() + ".tmp");
  writeFileSync(
    temp,
    JSON.stringify({
      key,
      camera,
      assignedAgent,
      revision: assignedAgent ? nonce() : undefined,
    }),
    {
      mode: 0o600,
      flag: "wx",
    },
  );
  renameSync(temp, join(dir, "peer.json"));
  console.error(`Saved ${assignedAgent ? "assignment to " + assignedAgent : "device pairing"}
Peer public key: ${key}
Fingerprint: ${fingerprint(key)}
Policy file: ${join(dir, "peer.json")}`);
}
function fingerprint(key) {
  return createHash("sha256")
    .update(Buffer.from(key, "base64url"))
    .digest("hex")
    .slice(0, 16);
}

// `camera` is the still-picture grant. It sits beside `media` in peer.json, and a local person can change it here.
export function setMediaConsent(consent) {
  if (
    !consent ||
    Object.keys(consent).some(
      (k) => !["camera", "video", "microphone", "speaker"].includes(k),
    ) ||
    Object.values(consent).some((v) => typeof v !== "boolean")
  )
    throw new Error("Invalid consent");
  const { camera, ...media } = consent;
  const current = peer();
  const temp = join(dir, nonce() + ".tmp");
  writeFileSync(
    temp,
    JSON.stringify({
      ...current,
      ...(camera === undefined ? {} : { camera }),
      media: { ...current.media, ...media },
      revision: nonce(),
    }),
    { mode: 0o600, flag: "wx" },
  );
  renameSync(temp, join(dir, "peer.json"));
}

export function readLocal(name, fallback = null) {
  try {
    return JSON.parse(readFileSync(join(dir, name), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}
export function writeLocal(name, value) {
  const temp = join(dir, nonce() + ".tmp");
  writeFileSync(temp, JSON.stringify(value), { mode: 0o600, flag: "wx" });
  renameSync(temp, join(dir, name));
}
export function applyLocalChange(change) {
  const current = peer();
  if (change.action === "transfer")
    pair(change.key, { assignedAgent: change.agent });
  else if (change.action === "revoke")
    writeLocal("peer.json", {
      key: null,
      assignedAgent: null,
      revision: nonce(),
      camera: false,
    });
  else if (change.action === "camera")
    writeLocal("peer.json", {
      ...current,
      camera: change.enabled,
      revision: nonce(),
    });
}

// Controller inventory is separate from the device's single local owner pin.
export { ControllerState } from "./controller-state.mjs";

export function setOutputConsent(grants) {
  if (
    !grants ||
    typeof grants !== "object" ||
    Array.isArray(grants) ||
    Object.keys(grants).some(
      (k) =>
        !["display.text", "display.image", "speaker.say", "speaker.play"].includes(k),
    ) ||
    Object.values(grants).some((v) => typeof v !== "boolean")
  )
    throw new Error("Invalid output grant");
  const current = peer();
  writeLocal("peer.json", {
    ...current,
    outputs: { ...current.outputs, ...grants },
    revision: nonce(),
  });
}
/** The local stop: every grant off, in one write. */
export function revokeAllGrants() {
  const current = peer();
  writeLocal("peer.json", {
    ...current,
    camera: false,
    media: { video: false, microphone: false, speaker: false },
    outputs: {
      "display.text": false,
      "display.image": false,
      "speaker.say": false,
      "speaker.play": false,
    },
    custom: Object.fromEntries(
      Object.keys(current.custom ?? {}).map((name) => [name, false]),
    ),
    revision: nonce(),
  });
}
export function setCustomConsent(name, enabled) {
  if (
    !/^custom\.[a-z][a-z0-9_-]{0,31}\.[a-z][a-z0-9_-]{0,31}$/.test(name) ||
    typeof enabled !== "boolean"
  )
    throw new Error("Invalid custom grant");
  const current = peer();
  writeLocal("peer.json", {
    ...current,
    custom: { ...current.custom, [name]: enabled },
    revision: nonce(),
  });
}
