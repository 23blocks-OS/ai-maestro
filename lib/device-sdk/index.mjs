import {
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
} from "node:crypto";
import { isIPv4 } from "node:net";

export function agentAddress(value) {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[A-Za-z0-9][A-Za-z0-9._+-]*@[A-Za-z0-9][A-Za-z0-9.-]*$/.test(value) ||
    /\s/.test(value)
  )
    throw new Error("Expected one full AMP agent address");
  return value;
}

export const nonce = () => randomBytes(24).toString("hex");
export function localAddress(host) {
  if (!isIPv4(host)) return false;
  const [a, b] = host.split(".").map(Number);
  return a === 127 || (a === 100 && b >= 64 && b <= 127);
}
export function privateOrigin(value) {
  const url = new URL(value);
  if (
    !localAddress(url.hostname) ||
    url.protocol !== "http:" ||
    url.username ||
    url.password ||
    url.href !== url.origin + "/"
  ) {
    throw new Error("Use a loopback or Tailscale IPv4 HTTP origin");
  }
  return url.origin;
}
export function identity() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    secret: privateKey.export({ type: "pkcs8", format: "pem" }),
    key: publicKey.export({ format: "jwk" }).x,
  };
}
export function publicKey(key) {
  if (
    typeof key !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(key) ||
    Buffer.from(key, "base64url").toString("base64url") !== key
  )
    throw new Error("Invalid Ed25519 public key");
  return createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: key },
    format: "jwk",
  });
}
const domain = Buffer.from("ai-maestro-device/1\0");
export function seal(data, secret) {
  const body = Buffer.from(JSON.stringify(data));
  return {
    body: body.toString("base64url"),
    signature: sign(null, Buffer.concat([domain, body]), secret).toString(
      "base64url",
    ),
  };
}
export function open(packet, key) {
  if (typeof packet?.body !== "string" || typeof packet.signature !== "string")
    throw new Error("Invalid packet");
  const bytes = Buffer.from(packet.body, "base64url");
  if (
    !verify(
      null,
      Buffer.concat([domain, bytes]),
      publicKey(key),
      Buffer.from(packet.signature, "base64url"),
    )
  )
    throw new Error("Invalid signature");
  return JSON.parse(bytes.toString());
}
async function limitedJson(response, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error("Response too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function call(origin, self, device, capability, fetcher = fetch) {
  const command =
    capability === undefined
      ? { type: "discover" }
      : { type: "invoke", capability };
  return exchange(
    origin,
    self,
    device,
    command,
    capability === undefined ? "register" : "result",
    fetcher,
  );
}
export function publishActivity(
  origin,
  self,
  device,
  assignedAgent,
  state,
  fetcher = fetch,
  active,
  label,
  hearing,
) {
  return exchange(
    origin,
    self,
    device,
    {
      type: "activity",
      assignedAgent: agentAddress(assignedAgent),
      state,
      ...(typeof active === "boolean" ? { active } : {}),
      ...(label ? { label } : {}),
      ...(hearing ? { hearing } : {}),
    },
    "activity.ack",
    fetcher,
  );
}
export async function exchange(
  origin,
  self,
  device,
  command,
  responseType,
  fetcher = fetch,
) {
  const base =
    typeof origin === "string"
      ? privateOrigin(origin)
      : reverseOrigin(origin, device);
  const prefix = typeof origin === "string" ? "/v1" : "";
  const options = { redirect: "error", signal: AbortSignal.timeout(15000) };
  const hello = await fetcher(base + prefix + "/challenge", options);
  if (!hello.ok) throw new Error("Challenge failed: " + hello.status);
  const { challenge } = await limitedJson(hello, 1024);
  if (!/^[a-f0-9]{48}$/.test(challenge)) throw new Error("Invalid challenge");
  const id = nonce();
  const request = { id, challenge, to: device, ...command };
  const res = await fetcher(base + prefix + "/request", {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(seal(request, self.secret)),
  });
  if (!res.ok) throw new Error("Request rejected: " + res.status);
  const result = open(await limitedJson(res, 2 * 1024 * 1024), device);
  if (
    result.id !== id ||
    result.to !== self.key ||
    result.challenge !== challenge ||
    result.type !== responseType
  )
    throw new Error("Uncorrelated response");
  return result;
}

export function reverseOrigin(value, device) {
  publicKey(device);
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).join() !== "reverse"
  )
    throw new Error("Invalid device endpoint");
  return privateOrigin(value.reverse) + "/v1/devices/" + device;
}
