export interface Identity {
  secret: string;
  key: string;
}
export interface Packet {
  body: string;
  signature: string;
}
export type DeviceEndpoint = string | { reverse: string };
export type Capability =
  | "device.health"
  | "camera.snapshot"
  | "display.text"
  | "display.image"
  | "speaker.say"
  | `custom.${string}`;
export type Response = { id: string; to: string; challenge: string } & (
  | {
      type: "register";
      assignedAgent: string;
      capabilities: Capability[];
      version: 1;
      events?: string[];
      streams: string[];
      permissions?: Record<string, boolean>;
      localApproval?: boolean;
      revision?: string;
      capabilityDefinitions?: Record<string, unknown>;
    }
  | {
      type: "result";
      ok: true;
      value:
        | { status: "ok"; platform: string }
        | { mime: "image/jpeg"; data: string };
    }
  | { type: "result"; ok: false; error: "denied" | "hardware_unavailable" }
);
export function agentAddress(value: string): string;
export function nonce(): string;
export function identity(): Identity;
export function publicKey(key: string): import("node:crypto").KeyObject;
export function localAddress(host: string): boolean;
export function privateOrigin(value: string): string;
export function seal(data: unknown, secret: string): Packet;
export function open(packet: Packet, key: string): unknown;
export function call(
  origin: DeviceEndpoint,
  self: Identity,
  device: string,
  capability?: Capability,
  fetcher?: typeof fetch,
): Promise<Response>;

export type ActivityState = "working" | "waiting" | "idle" | "unknown";
export function publishActivity(
  origin: DeviceEndpoint,
  self: Identity,
  device: string,
  assignedAgent: string,
  state: ActivityState,
  fetcher?: typeof fetch,
  active?: boolean,
  label?: string,
): Promise<{ type: "activity.ack"; id: string; to: string; challenge: string }>;

export function exchange(
  origin: DeviceEndpoint,
  self: Identity,
  device: string,
  command: Record<string, unknown>,
  responseType: string,
  fetcher?: typeof fetch,
): Promise<Record<string, unknown>>;
