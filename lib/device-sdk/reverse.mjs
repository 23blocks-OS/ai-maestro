import { voiceBytes } from "./capabilities.mjs";
import http from "node:http";
import { validateChange } from "./changes.mjs";
import { EventEmitter } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import WebSocket, { WebSocketServer } from "ws";
import {
  nonce,
  open,
  seal,
  privateOrigin,
  publicKey,
  agentAddress,
} from "./index.mjs";

const MAX_PACKET = 2200000;
const hex = (value) =>
  typeof value === "string" && /^[a-f0-9]{48}$/.test(value);
function send(socket, value) {
  if (
    socket.readyState !== WebSocket.OPEN ||
    socket.bufferedAmount > MAX_PACKET
  )
    throw new Error("Connection unavailable");
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body) > MAX_PACKET) throw new Error("Packet too large");
  socket.send(body);
}
export async function boundedJson(response, limit = MAX_PACKET) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error("Response too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
// Device pins come only from operator configuration, never from a peer's packet.
// protocol/reverse.md, Refusals. Anything else is temporary.
export const FINAL_REFUSALS = ["unknown_device", "not_owner", "revoked", "unsupported_version"];
const REFUSAL_HEADER = "X-ADP-Refusal";
const REFUSAL_CLOSE = 4003;

export class ReverseHub extends EventEmitter {
  constructor({
    identity,
    getIdentity = () => identity,
    getDevices,
    onUsed = () => {},
    onInput = () => {},
    onAudio = () => {},
    onProposal = () => {},
    heartbeatMs = 10000,
    silentMs = 30000,
  }) {
    super();
    Object.assign(this, {
      getIdentity,
      getDevices,
      onUsed,
      onInput,
      onAudio,
      onProposal,
    });
    this.connections = new Map();
    this.server = http.createServer(
      { requestTimeout: 12000, headersTimeout: 10000, maxHeaderSize: 8192 },
      (req, res) => this.http(req, res),
    );
    this.server.maxConnections = 64;
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_PACKET,
      perMessageDeflate: false,
    });
    this.server.on("upgrade", (req, socket, head) => {
      const key = req.url?.match(/^\/v1\/connect\/([A-Za-z0-9_-]{43})$/)?.[1];
      if (!key) {
        socket.destroy();
        return;
      }
      // Keeps out web pages, whose Origin is their site. Phone socket libraries always send the hub's own origin and
      // cannot remove it. Compared with the address in use, not the Host header, which a page's domain can control.
      const { origin } = req.headers;
      if (origin && origin !== `http://${socket.localAddress}:${socket.localPort}`) {
        this.emit("refused", { key, reason: "origin" });
        socket.destroy();
        return;
      }
      const refuse = (status, reason) => {
        this.emit("refused", { key, reason });
        socket.end(
          `HTTP/1.1 ${status} Refused\r\n${REFUSAL_HEADER}: ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
        );
      };
      if (!this.getDevices()[key]) return refuse(403, "unknown_device");
      if (this.wss.clients.size >= 64) return refuse(503, "busy");
      this.wss.handleUpgrade(req, socket, head, (ws) => this.accept(ws, key));
    });
    this.timer = setInterval(() => {
      for (const ws of this.wss.clients) {
        if (ws.deviceKey && !this.getDevices()[ws.deviceKey]) {
          this.emit("refused", { key: ws.deviceKey, reason: "revoked" });
          ws.close(REFUSAL_CLOSE, "revoked");
        } else if (Date.now() - ws.lastPong > silentMs) ws.terminate();
        else if (ws.readyState === WebSocket.OPEN) ws.ping();
      }
    }, heartbeatMs);
  }
  accept(ws, key) {
    ws.lastPong = Date.now();
    ws.on("pong", () => {
      ws.lastPong = Date.now();
    });
    const connectionAgent = this.getDevices()[key]?.agent;
    const identity = this.getIdentity(key);
    if (!identity) {
      ws.terminate();
      return;
    }
    const challenge = nonce();
    let authenticated = false,
      eventChallenge,
      lastUsed = 0,
      eventWindow = 0,
      eventCount = 0;
    const pending = new Map();
    const timeout = setTimeout(() => ws.terminate(), 5000);
    const issueEventChallenge = () => {
      eventChallenge = nonce();
      send(ws, { type: "event.challenge", challenge: eventChallenge });
    };
    ws.forward = (method, body, signal) =>
      new Promise((resolve, reject) => {
        if (!authenticated || pending.size >= 8 || signal?.aborted) {
          reject(new Error("Device unavailable or busy"));
          return;
        }
        const id = nonce();
        const cancel = () => {
          if (!pending.has(id)) return;
          pending.get(id).finish(new Error("Request cancelled"));
          try {
            send(ws, { type: "cancel", id });
          } catch {}
        };
        const timer = setTimeout(cancel, 15000);
        const finish = (error, value) => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", cancel);
          pending.delete(id);
          error ? reject(error) : resolve(value);
        };
        pending.set(id, { finish });
        signal?.addEventListener("abort", cancel, { once: true });
        try {
          send(ws, { type: "rpc", id, method, body });
        } catch (error) {
          finish(error);
        }
      });
    ws.on("message", async (bytes) => {
      try {
        const message = JSON.parse(bytes.toString());
        if (!authenticated) {
          const pin = this.getDevices()[key];
          if (!pin) throw new Error("Unpinned");
          const proof = open(message, key);
          if (proof.type === "connect" && proof.assignedAgent !== pin.agent) {
            this.emit("refused", { key, reason: "not_owner" });
            ws.close(REFUSAL_CLOSE, "not_owner");
            return;
          }
          if (
            proof.type !== "connect" ||
            proof.to !== identity.key ||
            proof.challenge !== challenge ||
            !hex(proof.id) ||
            !hex(proof.deviceChallenge) ||
            proof.assignedAgent !== pin.agent
          )
            throw new Error("Invalid handshake");
          authenticated = true;
          clearTimeout(timeout);
          ws.deviceKey = key;
          this.connections.get(key)?.terminate();
          this.connections.set(key, ws);
          send(
            ws,
            seal(
              {
                type: "connected",
                id: proof.id,
                challenge,
                to: key,
                deviceChallenge: proof.deviceChallenge,
              },
              identity.secret,
            ),
          );
          issueEventChallenge();
          this.emit("connected", key);
          return;
        }
        if (message.type === "rpc.result") {
          if (!hex(message.id) || !Number.isInteger(message.status))
            throw new Error("Invalid RPC result");
          pending
            .get(message.id)
            ?.finish(null, { status: message.status, body: message.body });
          return;
        }
        const event = open(message, key);
        if (
          !["device.used", "input", "audio", "proposal.result"].includes(event.type) ||
          event.to !== identity.key ||
          !hex(event.id) ||
          !eventChallenge ||
          event.challenge !== eventChallenge ||
          Object.keys(event).some(
            (k) =>
              ![
                "type",
                "to",
                "id",
                "challenge",
                "assignedAgent",
                ...(event.type === "input"
                  ? ["text"]
                  : event.type === "audio"
                    ? ["data"]
                    : event.type === "proposal.result"
                    ? ["requestId", "change", "status", "revision", "owner"]
                    : []),
              ].includes(k),
          )
        )
          throw new Error("Invalid device event");
        eventChallenge = null;
        const pin =
          this.getDevices()[key] ??
          (event.type === "proposal.result"
            ? { agent: connectionAgent }
            : null);
        if (!pin || event.assignedAgent !== pin.agent)
          throw new Error("Owner changed");
        if (Date.now() - eventWindow >= 1000) {
          eventWindow = Date.now();
          eventCount = 0;
        }
        if (++eventCount > 4) throw new Error("Event rate exceeded");
        if (event.type === "proposal.result") {
          if (
            !hex(event.requestId) ||
            !["confirmed", "rejected"].includes(event.status) ||
            !(event.revision === null || typeof event.revision === "string") ||
            !(event.owner === null || typeof event.owner === "string")
          )
            throw new Error("Invalid proposal receipt");
          validateChange(event.change);
          await this.onProposal(key, event);
          this.emit("proposal", key, event);
        } else if (event.type === "input") {
          if (
            typeof event.text !== "string" ||
            !event.text.trim() ||
            Buffer.byteLength(event.text) > 4096
          )
            throw new Error("Invalid input");
          await this.onInput(key, event.text);
          this.emit("input", key, event.text);
        } else if (event.type === "audio") {
          const audio = voiceBytes(event.data);
          // Acknowledged now: the ack means accepted, and turning speech into text outlasts the device's wait
          Promise.resolve()
            .then(() => this.onAudio(key, audio))
            .catch((error) => this.emit("audioFailed", key, error));
        } else if (Date.now() - lastUsed >= 1000) {
          lastUsed = Date.now();
          await this.onUsed(key, event);
          this.emit("used", key);
        }
        send(
          ws,
          seal(
            {
              type: "event.ack",
              id: event.id,
              challenge: event.challenge,
              to: key,
              accepted: true,
            },
            identity.secret,
          ),
        );
        issueEventChallenge();
      } catch {
        ws.terminate();
      }
    });
    ws.on("error", () => {});
    ws.on("close", () => {
      clearTimeout(timeout);
      for (const entry of [...pending.values()])
        entry.finish(new Error("Device disconnected"));
      if (this.connections.get(key) === ws) {
        this.connections.delete(key);
        this.emit("disconnected", key);
      }
    });
    send(ws, { type: "hello", challenge });
  }
  async http(req, res) {
    const reply = (status, body) => {
      if (!res.destroyed)
        res
          .writeHead(status, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          })
          .end(JSON.stringify(body));
    };
    const match = req.url?.match(
      /^\/v1\/devices\/([A-Za-z0-9_-]{43})\/(challenge|request)$/,
    );
    if (!match) return reply(404, { error: "unknown_route" });
    const [, key, kind] = match,
      ws = this.connections.get(key);
    if (!ws || !this.getDevices()[key])
      return reply(503, { error: "device_disconnected" });
    if (
      (kind === "challenge" && req.method !== "GET") ||
      (kind === "request" && req.method !== "POST")
    )
      return reply(405, { error: "method" });
    const abort = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) abort.abort();
    });
    try {
      let body;
      if (kind === "request") {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 800000) return reply(413, { error: "too_large" });
          chunks.push(chunk);
        }
        body = JSON.parse(Buffer.concat(chunks));
        const command = open(body, this.getIdentity(key).key);
        if (
          command.to !== key ||
          !["discover", "invoke", "activity", "proposal"].includes(command.type)
        )
          return reply(400, { error: "unsupported_reverse_operation" });
      }
      const result = await ws.forward(kind, body, abort.signal);
      reply(result.status, result.body);
    } catch {
      reply(503, { error: "device_unavailable" });
    }
  }
  async close() {
    clearInterval(this.timer);
    for (const socket of this.wss.clients) socket.terminate();
    await new Promise((resolve) => this.wss.close(resolve));
    await new Promise((resolve) => {
      this.server.close(resolve);
      this.server.closeAllConnections();
    });
  }
}

// The adapter dispatches only challenge/request; it never accepts a URL or shell command.
export class DeviceConnection extends EventEmitter {
  constructor({
    origin,
    identity,
    getPeer,
    adapter,
    retryMinMs = 1000,
    retryMaxMs = 30000,
    finalAttempts = 3,
  }) {
    super();
    Object.assign(this, {
      finalAttempts,
      origin: privateOrigin(origin),
      identity,
      getPeer,
      adapter,
      retryMinMs,
      retryMaxMs,
    });
    this.owner = getPeer();
    publicKey(this.owner.key);
    agentAddress(this.owner.assignedAgent);
    this.abort = new AbortController();
    this.connected = false;
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
    this.done = this.loop();
  }
  ownerMatches() {
    try {
      const p = this.getPeer();
      return (
        p.key === this.owner.key && p.assignedAgent === this.owner.assignedAgent
      );
    } catch {
      return false;
    }
  }
  async loop() {
    let backoff = this.retryMinMs;
    let refused = 0;
    while (!this.abort.signal.aborted && this.ownerMatches()) {
      this.refusal = null;
      await this.session();
      if (this.abort.signal.aborted || !this.ownerMatches()) break;
      // A few tries first: a device can connect just before its assignment is complete
      refused = FINAL_REFUSALS.includes(this.refusal) ? refused + 1 : 0;
      if (refused >= this.finalAttempts) {
        this.stopped = this.refusal;
        this.emit("stopped", this.refusal);
        break;
      }
      await delay(
        backoff + Math.floor((Math.random() * backoff) / 4),
        undefined,
        { signal: this.abort.signal },
      ).catch(() => {});
      backoff = Math.min(this.retryMaxMs, backoff * 2);
      if (this.wasConnected) backoff = this.retryMinMs;
    }
  }
  session() {
    return new Promise((resolve) => {
      const ws = new WebSocket(
        this.origin.replace(/^http:/, "ws:") +
          "/v1/connect/" +
          this.identity.key,
        {
          maxPayload: MAX_PACKET,
          perMessageDeflate: false,
          handshakeTimeout: 5000,
        },
      );
      this.socket = ws;
      this.wasConnected = false;
      ws.on("unexpected-response", (request, response) => {
        this.refusal = response.headers[REFUSAL_HEADER.toLowerCase()] ?? null;
        request.destroy();
        ws.terminate();
      });
      ws.on("close", (code, reason) => {
        if (code === REFUSAL_CLOSE) this.refusal = reason.toString();
      });
      this.eventChallenge = null;
      let proof,
        deviceChallenge,
        authenticated = false,
        lastMessage = Date.now();
      const requests = new Map();
      const timeout = setTimeout(() => ws.terminate(), 5000);
      const ownerTimer = setInterval(() => {
        if (
          (!this.ownerMatches() && !this.finishingReceipt) ||
          Date.now() - lastMessage > 35000
        )
          ws.terminate();
      }, 100);
      const stop = () => ws.terminate();
      this.abort.signal.addEventListener("abort", stop, { once: true });
      ws.on("ping", () => {
        lastMessage = Date.now();
      });
      ws.on("error", () => {});
      ws.on("message", async (bytes) => {
        lastMessage = Date.now();
        try {
          const message = JSON.parse(bytes.toString());
          if (!authenticated) {
            if (!proof) {
              if (message.type !== "hello" || !hex(message.challenge))
                throw new Error("Invalid challenge");
              deviceChallenge = nonce();
              proof = {
                type: "connect",
                id: nonce(),
                challenge: message.challenge,
                to: this.owner.key,
                deviceChallenge,
                assignedAgent: this.owner.assignedAgent,
              };
              send(ws, seal(proof, this.identity.secret));
              return;
            }
            const answer = open(message, this.owner.key);
            if (
              answer.type !== "connected" ||
              answer.id !== proof.id ||
              answer.challenge !== proof.challenge ||
              answer.deviceChallenge !== deviceChallenge ||
              answer.to !== this.identity.key
            )
              throw new Error("Invalid controller");
            authenticated = true;
            clearTimeout(timeout);
            this.connected = true;
            this.wasConnected = true;
            this.resolveReady();
            this.emit("connected");
            return;
          }
          if (message.body && message.signature) {
            const ack = open(message, this.owner.key),
              pending = this.pendingEvent;
            if (ack.type !== "event.ack" || ack.to !== this.identity.key)
              throw new Error("Invalid event acknowledgement");
            if (
              pending &&
              ack.id === pending.id &&
              ack.challenge === pending.challenge
            ) {
              clearTimeout(pending.timer);
              this.pendingEvent = null;
              ack.accepted
                ? pending.resolve()
                : pending.reject(new Error("Input rejected"));
            }
            return;
          }
          if (message.type === "event.challenge" && hex(message.challenge)) {
            this.eventChallenge = message.challenge;
            return;
          }
          if (message.type === "cancel" && hex(message.id)) {
            requests.get(message.id)?.abort();
            return;
          }
          if (
            message.type !== "rpc" ||
            !hex(message.id) ||
            !["challenge", "request"].includes(message.method) ||
            requests.has(message.id) ||
            requests.size >= 8
          )
            throw new Error("Invalid request");
          if (!this.ownerMatches()) {
            send(ws, {
              type: "rpc.result",
              id: message.id,
              status: 403,
              body: { error: "owner_changed" },
            });
            return;
          }
          const abort = new AbortController();
          requests.set(message.id, abort);
          try {
            const response = await this.adapter(
              message.method,
              message.body,
              abort.signal,
            );
            if (!abort.signal.aborted && this.ownerMatches())
              send(ws, { type: "rpc.result", id: message.id, ...response });
          } catch {
            if (!abort.signal.aborted && ws.readyState === WebSocket.OPEN)
              send(ws, {
                type: "rpc.result",
                id: message.id,
                status: 503,
                body: { error: "adapter_failed" },
              });
          } finally {
            requests.delete(message.id);
          }
        } catch {
          ws.terminate();
        }
      });
      ws.on("close", () => {
        clearInterval(ownerTimer);
        clearTimeout(timeout);
        this.abort.signal.removeEventListener("abort", stop);
        for (const abort of requests.values()) abort.abort();
        this.connected = false;
        this.eventChallenge = null;
        if (this.pendingEvent) {
          clearTimeout(this.pendingEvent.timer);
          this.pendingEvent.reject(new Error("Controller disconnected"));
          this.pendingEvent = null;
        }
        this.emit("disconnected");
        resolve();
      });
    });
  }
  sendEvent(type, text, receipt) {
    if (
      !this.connected ||
      !this.eventChallenge ||
      this.pendingEvent ||
      (!this.ownerMatches() && type !== "proposal.result")
    )
      return Promise.reject(new Error("Controller is disconnected or busy"));
    const challenge = this.eventChallenge;
    this.eventChallenge = null;
    const id = nonce();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingEvent = null;
        reject(new Error("Event acknowledgement timed out"));
      }, 5000);
      this.pendingEvent = { id, challenge, resolve, reject, timer };
      try {
        send(
          this.socket,
          seal(
            {
              type,
              id,
              challenge,
              to: this.owner.key,
              assignedAgent: this.owner.assignedAgent,
              ...(type === "input"
                ? { text }
                : type === "audio"
                  ? { data: text }
                  : type === "proposal.result"
                  ? {
                      requestId: receipt.id,
                      change: receipt.change,
                      status: receipt.status,
                      revision: receipt.revision,
                      owner: receipt.assignedAgent,
                    }
                  : {}),
            },
            this.identity.secret,
          ),
        );
      } catch (error) {
        clearTimeout(timer);
        this.pendingEvent = null;
        reject(error);
      }
    });
  }
  used() {
    return this.sendEvent("device.used");
  }
  input(text) {
    if (
      typeof text !== "string" ||
      !text.trim() ||
      Buffer.byteLength(text) > 4096
    )
      return Promise.reject(new Error("Input must contain 1–4096 UTF-8 bytes"));
    return this.sendEvent("input", text);
  }
  /** What a person said, for the controller to turn into text. Held to talk: the person chose to send it. */
  async audio(wavBytes) {
    const data = Buffer.from(wavBytes).toString("base64");
    voiceBytes(data);
    return this.sendEvent("audio", data);
  }
  async finishProposal(receipt) {
    if (!receipt || receipt.ownerKey !== this.owner.key || !this.connected)
      return;
    this.finishingReceipt = true;
    try {
      const deadline = Date.now() + 1000;
      while (
        (this.pendingEvent || !this.eventChallenge) &&
        Date.now() < deadline &&
        this.connected
      )
        await delay(10);
      await this.sendEvent("proposal.result", undefined, receipt);
    } finally {
      this.finishingReceipt = false;
      if (!this.ownerMatches()) this.socket?.terminate();
    }
  }
  async stop() {
    this.abort.abort();
    this.socket?.terminate();
    await this.done;
  }
}
