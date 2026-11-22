// Encrypted home network connection (docs/wiki/specs/S003-encrypted-home-network-connection.md): a key exchange
// signed with the pinned v1 keys, then ChaCha20-Poly1305 messages with implicit per-direction counters.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
} from "node:crypto";
import { agentAddress, nonce, open, publicKey, seal } from "./index.mjs";

export const SECURE_VERSION = 1;
export const MAX_SECURE_MESSAGE = 2200000;
const LABEL = "adp-secure/1";
const TAG = 16;
const X25519_PKCS8 = Buffer.from("302e020100300506032b656e04220420", "hex");
const MAX_COUNTER = 2 ** 32;
const hex = (value) => typeof value === "string" && /^[a-f0-9]{48}$/.test(value);
const rawKey = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9_-]{43}$/.test(value) &&
  Buffer.from(value, "base64url").length === 32 &&
  Buffer.from(value, "base64url").toString("base64url") === value;

/** A new X25519 key pair, or one from a fixed 32-byte secret (test vectors only). */
export function ephemeralKey(secret) {
  // A raw 32-byte X25519 secret in its PKCS#8 wrapper (RFC 8410)
  const privateKey = secret
    ? createPrivateKey({ key: Buffer.concat([X25519_PKCS8, Buffer.from(secret)]), format: "der", type: "pkcs8" })
    : generateKeyPairSync("x25519").privateKey;
  const x = createPublicKey(privateKey).export({ format: "jwk" }).x;
  return { privateKey, public: x };
}

function shared(privateKey, peer) {
  const secret = diffieHellman({
    privateKey,
    publicKey: createPublicKey({ key: { kty: "OKP", crv: "X25519", x: peer }, format: "jwk" }),
  });
  if (secret.every((b) => b === 0)) throw new Error("Invalid key exchange");
  return secret;
}

/** The two direction keys, from the X25519 result and the decoded bodies of the hello and the accept. */
export function deriveKeys(secret, helloBody, acceptBody) {
  const transcript = createHash("sha256")
    .update(Buffer.from(`${LABEL}\0`))
    .update(helloBody)
    .update(acceptBody)
    .digest();
  const key = (info) => Buffer.from(hkdfSync("sha256", secret, transcript, Buffer.from(`${LABEL} ${info}`), 32));
  return { controllerToDevice: key("controller-to-device"), deviceToController: key("device-to-controller") };
}

/** One direction of encrypted messages. The counter is implicit: a missing, repeated or reordered message fails. */
class Direction {
  constructor(key) {
    this.key = key;
    this.counter = 0;
  }
  nonce() {
    if (this.counter >= MAX_COUNTER) throw new Error("Message limit reached");
    const n = Buffer.alloc(12);
    n.writeBigUInt64BE(BigInt(this.counter++), 4);
    return n;
  }
}

export class SecureChannel {
  constructor(sendKey, receiveKey) {
    this.out = new Direction(sendKey);
    this.in = new Direction(receiveKey);
  }
  /** The JSON text a plain connection would send, as one binary message */
  seal(text) {
    const plain = Buffer.from(text);
    if (plain.length > MAX_SECURE_MESSAGE) throw new Error("Packet too large");
    const cipher = createCipheriv("chacha20-poly1305", this.out.key, this.out.nonce(), { authTagLength: TAG });
    return Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  }
  /** A binary message back to its JSON text. Throws on anything else; the caller closes the connection. */
  open(bytes, isBinary) {
    if (!isBinary) throw new Error("Plain message on an encrypted connection");
    const data = Buffer.isBuffer(bytes) ? bytes : Buffer.concat(bytes);
    if (data.length < TAG || data.length - TAG > MAX_SECURE_MESSAGE) throw new Error("Invalid encrypted message");
    const decipher = createDecipheriv("chacha20-poly1305", this.in.key, this.in.nonce(), { authTagLength: TAG });
    decipher.setAuthTag(data.subarray(data.length - TAG));
    return Buffer.concat([decipher.update(data.subarray(0, data.length - TAG)), decipher.final()]).toString();
  }
}

const body = (packet) => Buffer.from(packet.body, "base64url");

/** Controller, step 1: the signed hello with a new ephemeral key. Keep `state` for finish(). */
export function secureHello(controllerSecret, deviceKey, ephemeral = ephemeralKey()) {
  publicKey(deviceKey);
  const message = {
    type: "secure.hello",
    version: SECURE_VERSION,
    id: nonce(),
    challenge: nonce(),
    to: deviceKey,
    ephemeral: ephemeral.public,
  };
  const packet = seal(message, controllerSecret);
  return { packet, state: { message, ephemeral, helloBody: body(packet) } };
}

/** Device, step 2: verify the hello with the pinned controller key, answer, and derive the channel. */
export function secureAccept(hello, { controllerKey, identity, assignedAgent }, ephemeral = ephemeralKey()) {
  const m = open(hello, controllerKey);
  if (
    m.type !== "secure.hello" ||
    m.version !== SECURE_VERSION ||
    m.to !== identity.key ||
    !hex(m.id) ||
    !hex(m.challenge) ||
    !rawKey(m.ephemeral) ||
    Object.keys(m).length !== 6
  )
    throw new Error("Invalid secure hello");
  const packet = seal(
    {
      type: "secure.accept",
      version: SECURE_VERSION,
      id: m.id,
      challenge: m.challenge,
      to: controllerKey,
      assignedAgent: agentAddress(assignedAgent),
      ephemeral: ephemeral.public,
      peerEphemeral: m.ephemeral,
    },
    identity.secret,
  );
  const keys = deriveKeys(shared(ephemeral.privateKey, m.ephemeral), body(hello), body(packet));
  return { packet, channel: new SecureChannel(keys.deviceToController, keys.controllerToDevice) };
}

/** Controller, step 3: verify the accept with the pinned device key and pinned agent, and derive the channel. */
export function secureFinish(state, accept, { deviceKey, controllerKey, assignedAgent }) {
  const m = open(accept, deviceKey);
  if (
    m.type !== "secure.accept" ||
    m.version !== SECURE_VERSION ||
    m.id !== state.message.id ||
    m.challenge !== state.message.challenge ||
    m.to !== controllerKey ||
    m.peerEphemeral !== state.ephemeral.public ||
    !rawKey(m.ephemeral) ||
    Object.keys(m).length !== 8
  )
    throw new Error("Invalid secure accept");
  if (m.assignedAgent !== assignedAgent) throw Object.assign(new Error("Device names another agent"), { refusal: "not_owner" });
  const keys = deriveKeys(shared(state.ephemeral.privateKey, m.ephemeral), state.helloBody, body(accept));
  return new SecureChannel(keys.controllerToDevice, keys.deviceToController);
}
