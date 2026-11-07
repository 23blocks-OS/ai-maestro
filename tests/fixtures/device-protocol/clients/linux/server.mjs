import http from "node:http";
import { sameChange } from "../../packages/sdk/changes.mjs";
import {
  builtinCapabilities,
  validateArguments,
  imageBytes,
  audioBytes,
} from "../../packages/sdk/capabilities.mjs";
import { speechReady, playReady, play, Voice } from "./output.mjs";
import { mediaFormats } from "../../packages/sdk/media.mjs";
import { agentAddress, nonce, open, seal } from "@ai-maestro/device-sdk";
import { cameraReady, snapshot } from "./hardware.mjs";

const OUTPUTS = ["display.text", "display.image", "speaker.say", "speaker.play"];

export function bridge(
  self,
  getPeer,
  hardware = { cameraReady, snapshot },
  display,
  media,
  proposals,
  custom,
) {
  const indicatorReady = () =>
    hardware.indicatorReady?.() ?? display?.indicatorReady() ?? false;
  const outputReady = (name) =>
    name === "speaker.say"
      ? speechReady()
      : name === "speaker.play"
        ? (hardware.playReady ?? playReady)()
        : !!display;
  const voice = hardware.voice ?? new Voice({ play: hardware.play ?? play });
  const challenges = new Map();
  let captureOwner;
  let sequence = 0;
  const bootId = nonce();
  const server = http.createServer(
    { requestTimeout: 12000, headersTimeout: 10000, maxHeaderSize: 8192 },
    async (req, res) => {
      const reply = (status, data) =>
        res
          .writeHead(status, {
            "content-type": "application/json",
            "cache-control": "no-store",
          })
          .end(JSON.stringify(data));
      try {
        if (req.method === "GET" && req.url === "/v1/challenge") {
          const now = Date.now();
          for (const [key, expiry] of challenges)
            if (expiry.until <= now) challenges.delete(key);
          if (challenges.size >= 512) return reply(429, { error: "busy" });
          const challenge = nonce();
          challenges.set(challenge, { until: now + 30000, order: ++sequence });
          return reply(200, { challenge });
        }
        if (req.method !== "POST" || req.url !== "/v1/request")
          return reply(404, { error: "unknown_route" });
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 800000) return reply(413, { error: "too_large" });
          chunks.push(chunk);
        }
        const packet = JSON.parse(Buffer.concat(chunks));
        let peer,
          msg,
          receiptOnly = false;
        try {
          peer = getPeer();
          msg = open(packet, peer.key);
        } catch {
          const receipt = proposals?.receipt();
          if (!receipt) throw new Error("Unassigned");
          msg = open(packet, receipt.ownerKey);
          if (
            msg.type !== "proposal" ||
            msg.requestId !== receipt.id ||
            !sameChange(msg.change, receipt.change)
          )
            throw new Error("Revoked");
          peer = { key: receipt.ownerKey };
          receiptOnly = true;
        }
        const assignedAgent = receiptOnly
          ? undefined
          : agentAddress(peer.assignedAgent);
        const ticket = challenges.get(msg?.challenge);
        if (
          msg?.to !== self.key ||
          !/^[a-f0-9]{48}$/.test(msg.id) ||
          !(ticket?.until > Date.now())
        )
          return reply(403, { error: "invalid_request" });
        challenges.delete(msg.challenge);
        if (
          captureOwner &&
          (captureOwner.key !== peer.key ||
            captureOwner.assignedAgent !== assignedAgent)
        )
          return reply(409, { error: "transfer_draining" });
        const base = { to: peer.key, id: msg.id, challenge: msg.challenge };
        const result = (data) =>
          reply(200, seal({ ...base, ...data }, self.secret));
        if (receiptOnly)
          return result({
            type: "proposal.ack",
            requestId: msg.requestId,
            status: proposals.receipt().status,
            revision: proposals.receipt().revision,
            assignedAgent: proposals.receipt().assignedAgent,
          });
        const capabilities = ["device.health"];
        if (peer.camera === true && hardware.cameraReady() && indicatorReady())
          capabilities.push("camera.snapshot");
        const definitions = {
          ...Object.fromEntries(
            capabilities.map((name) => [name, builtinCapabilities[name]]),
          ),
          ...(custom?.definitions(peer) ?? {}),
        };
        for (const name of OUTPUTS) {
          if (peer.outputs?.[name] === true && outputReady(name)) {
            capabilities.push(name);
            definitions[name] = builtinCapabilities[name];
          }
        }
        for (const name of Object.keys(definitions))
          if (name.startsWith("custom.")) capabilities.push(name);
        if (msg.type === "discover")
          return result({
            type: "register",
            version: 1,
            bootId,
            revision: peer.revision,
            assignedAgent,
            capabilities,
            capabilityDefinitions: definitions,
            streams: media?.advertised(peer) ?? [],
            mediaFormats: Object.fromEntries(
              (media?.advertised(peer) ?? []).map((kind) => [
                kind,
                mediaFormats[kind],
              ]),
            ),
            permissions: {
              camera: peer.camera === true,
              ...peer.media,
              ...peer.outputs,
              ...peer.custom,
            },
            ...(proposals ? { localApproval: true } : {}),
            ...(display ? { events: ["activity"] } : {}),
          });
        if (msg.type === "activity" && display) {
          if (
            msg.assignedAgent !== assignedAgent ||
            (msg.active !== undefined && typeof msg.active !== "boolean") ||
            !["working", "waiting", "idle", "unknown"].includes(msg.state) ||
            Object.keys(msg).some(
              (k) =>
                ![
                  "type",
                  "id",
                  "challenge",
                  "to",
                  "assignedAgent",
                  "state",
                  "active",
                ].includes(k),
            )
          )
            return reply(400, { error: "invalid_activity" });
          if (!display.update(peer, msg.state, ticket.order, msg.active))
            return reply(409, { error: "superseded" });
          return result({ type: "activity.ack" });
        }
        if (msg.type === "proposal" && proposals) {
          if (
            !/^[a-f0-9]{48}$/.test(msg.requestId) ||
            Object.keys(msg).some(
              (k) =>
                ![
                  "type",
                  "id",
                  "challenge",
                  "to",
                  "requestId",
                  "change",
                  "expectedRevision",
                ].includes(k),
            )
          )
            return reply(400, { error: "invalid_proposal" });
          try {
            const pending = proposals.request(
              msg.requestId,
              msg.change,
              msg.expectedRevision,
            );
            return result({
              type: "proposal.ack",
              requestId: pending.id,
              status: pending.status,
              revision: pending.revision,
              assignedAgent: pending.assignedAgent,
            });
          } catch {
            return reply(409, { error: "proposal_rejected" });
          }
        }
        if (msg.type === "media" && media) {
          if (
            !["video", "microphone"].includes(msg.kind) ||
            !Number.isInteger(msg.seconds) ||
            msg.seconds < 1 ||
            msg.seconds > 60 ||
            (msg.format !== undefined &&
              msg.format !== mediaFormats[msg.kind]?.mime) ||
            Object.keys(msg).some(
              (k) =>
                ![
                  "type",
                  "id",
                  "challenge",
                  "to",
                  "kind",
                  "seconds",
                  "format",
                ].includes(k),
            )
          )
            return reply(400, { error: "invalid_media" });
          if (msg.kind === "video" && captureOwner)
            return reply(409, { error: "camera_busy" });
          if (!media.allowed(msg.kind, peer))
            return reply(403, { error: "permission_denied" });
          if (media.sessions.has(msg.kind))
            return reply(409, { error: "media_busy" });
          res.writeHead(200, {
            "content-type": "application/x-ndjson",
            "cache-control": "no-store",
          });
          let sequence = 0;
          const emit = (type, fields) =>
            res.write(
              JSON.stringify(
                seal(
                  {
                    ...base,
                    type,
                    kind: msg.kind,
                    sequence: sequence++,
                    ...fields,
                  },
                  self.secret,
                ),
              ) + "\n",
            );
          let stop = () => {};
          res.on("close", () => stop());
          stop = media.run(
            msg.kind,
            peer,
            msg.seconds,
            (data) => {
              if (res.writableLength > 1000000) {
                stop();
                return;
              }
              emit("media.frame", { data: data.toString("base64") });
            },
            (reason) => {
              if (!res.destroyed) {
                emit("media.end", { reason });
                res.end();
              }
            },
          );
          return;
        }
        if (msg.type === "speaker" && media) {
          if (
            typeof msg.data !== "string" ||
            Object.keys(msg).some(
              (k) => !["type", "id", "challenge", "to", "data"].includes(k),
            )
          )
            return reply(400, { error: "invalid_audio" });
          const pcm = Buffer.from(msg.data, "base64");
          if (
            pcm.length === 0 ||
            pcm.length > 320000 ||
            pcm.length % 2 ||
            pcm.toString("base64") !== msg.data
          )
            return reply(400, { error: "invalid_audio" });
          if (!media.allowed("speaker", peer))
            return reply(403, { error: "permission_denied" });
          if (media.sessions.has("speaker"))
            return reply(409, { error: "media_busy" });
          let stop = () => {};
          res.on("close", () => stop());
          stop = media.run(
            "speaker",
            peer,
            pcm.length / 32000,
            () => {},
            (reason) => {
              if (!res.destroyed)
                result({
                  type: "result",
                  ok: reason === "completed",
                  ...(reason === "completed"
                    ? { value: { played: true } }
                    : { error: reason }),
                });
            },
            pcm,
          );
          return;
        }
        const allowedFields = [
          "to",
          "id",
          "challenge",
          "type",
          "capability",
          "args",
        ];
        if (
          msg.type !== "invoke" ||
          Object.keys(msg).some((k) => !allowedFields.includes(k)) ||
          !capabilities.includes(msg.capability)
        )
          return result({ type: "result", ok: false, error: "denied" });
        try {
          validateArguments(definitions[msg.capability].args, msg.args ?? {});
          if (msg.capability === "display.image") imageBytes(msg.args);
          if (msg.capability === "speaker.play") audioBytes(msg.args);
        } catch {
          return result({
            type: "result",
            ok: false,
            error: "invalid_arguments",
          });
        }
        if (
          OUTPUTS.includes(msg.capability) ||
          msg.capability.startsWith("custom.")
        ) {
          const abort = new AbortController();
          const check = () => {
            try {
              const p = getPeer();
              if (
                p.key !== peer.key ||
                p.assignedAgent !== peer.assignedAgent ||
                p.revision !== peer.revision
              )
                abort.abort();
            } catch {
              abort.abort();
            }
          };
          const timer = setInterval(check, 100);
          res.on("close", () => {
            if (!res.writableEnded) abort.abort();
          });
          try {
            let value;
            if (msg.capability === "speaker.say")
              value = await voice.say(msg.args.text, abort.signal);
            else if (msg.capability === "speaker.play")
              value = await voice.play(audioBytes(msg.args), abort.signal);
            else if (msg.capability.startsWith("custom."))
              value = await custom.invoke(
                msg.capability,
                msg.args ?? {},
                peer,
                abort.signal,
              );
            else {
              display.show(peer, msg.args);
              value = { shown: true };
            }
            check();
            if (abort.signal.aborted)
              return result({
                type: "result",
                ok: false,
                error: "grant_revoked",
              });
            return result({ type: "result", ok: true, value });
          } catch {
            return result({
              type: "result",
              ok: false,
              error: "hardware_unavailable",
            });
          } finally {
            clearInterval(timer);
          }
        }
        if (msg.capability === "device.health")
          return result({
            type: "result",
            ok: true,
            value: { status: "ok", platform: process.platform },
          });
        if (captureOwner || media?.sessions.has("video"))
          return result({
            type: "result",
            ok: false,
            error: "hardware_unavailable",
          });
        captureOwner = { key: peer.key, assignedAgent };
        const captureAbort = new AbortController();
        const captureTimer = setInterval(() => {
          try {
            const p = getPeer();
            if (
              !indicatorReady() ||
              p.key !== peer.key ||
              p.revision !== peer.revision
            )
              captureAbort.abort();
          } catch {
            captureAbort.abort();
          }
        }, 100);
        res.on("close", () => {
          if (!res.writableEnded) captureAbort.abort();
        });
        try {
          if (hardware.indicate) await hardware.indicate("camera");
          else await display.indicate("camera");
          if (captureAbort.signal.aborted) throw new Error("Capture stopped");
          const value = await hardware.snapshot(captureAbort.signal);
          if (res.destroyed) return;
          const current = getPeer();
          if (
            current.key !== peer.key ||
            current.assignedAgent !== assignedAgent ||
            current.revision !== peer.revision ||
            current.camera !== true ||
            !indicatorReady() ||
            captureAbort.signal.aborted
          )
            return reply(403, { error: "grant_revoked" });
          display?.capture(peer, value);
          return result({ type: "result", ok: true, value });
        } catch {
          return result({
            type: "result",
            ok: false,
            error: "hardware_unavailable",
          });
        } finally {
          clearInterval(captureTimer);
          captureOwner = undefined;
        }
      } catch {
        return reply(403, { error: "invalid_request" });
      }
    },
  );
  server.maxConnections = 64;
  return server;
}
