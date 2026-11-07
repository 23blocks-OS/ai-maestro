import type { Identity, DeviceEndpoint } from "./index.mjs";
import type { ReverseHub } from "./reverse.mjs";
export interface DeviceRecord {
  key: string;
  name: string;
  endpoint: DeviceEndpoint;
  verified: boolean;
  owner: string | null;
  active: boolean;
  state: "unverified" | "online" | "offline" | "revoked";
  capabilities: string[];
  revision?: string;
  streams?: string[];
  permissions?: Record<string, boolean>;
  lastSeen?: number;
}
export interface ControllerEvent {
  id: string;
  type: string;
  agent: string;
  deviceKey: string;
  text?: string;
  source?: "device";
}
export interface ControllerSnapshot {
  version: 1;
  agents: Array<{
    address: string;
    activeDeviceKey: string | null;
    devices: DeviceRecord[];
  }>;
  pendingEvents: ControllerEvent[];
  proposals: Array<{
    agent: string;
    deviceKey: string;
    requestId: string;
    change: DeviceChange;
    receipt?: Record<string, unknown>;
  }>;
}
export type DeviceChange =
  | { action: "transfer"; agent: string; key: string }
  | { action: "camera"; enabled: boolean }
  | { action: "revoke" };
export class Controller {
  constructor(options?: {
    onEvent?: (event: ControllerEvent) => void | Promise<void>;
    onStateChange?: (snapshot: ControllerSnapshot) => void;
    transport?: {
      call: typeof import("./index.mjs").call;
      exchange: typeof import("./index.mjs").exchange;
      streamMedia: typeof import("./media.mjs").streamMedia;
    };
  });
  addAgent(agent: { address: string; identity?: Identity }): void;
  pinDevice(
    address: string,
    device: { key: string; endpoint: DeviceEndpoint; name?: string },
  ): DeviceRecord;
  registerDevice(
    address: string,
    device: { key: string; endpoint: DeviceEndpoint; name?: string },
  ): Promise<DeviceRecord>;
  inventory(address: string): DeviceRecord[];
  refresh(address: string, key: string): Promise<DeviceRecord>;
  jump(
    address: string,
    key: string | null,
  ): { activeDeviceKey: string | null; generation: number };
  invoke(
    address: string,
    key: string,
    capability: string,
    args?: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
  media(
    address: string,
    key: string,
    kind: "video" | "microphone",
    seconds: number,
    options?: { signal?: AbortSignal },
  ): AsyncGenerator<{ kind: string; sequence: number; bytes: Buffer }>;
  propose(
    address: string,
    key: string,
    change: DeviceChange,
    options?: { expectedRevision?: string; requestId?: string },
  ): Promise<Record<string, unknown>>;
  createHub(options?: {
    heartbeatMs?: number;
    silentMs?: number;
    /** Speech from a device's talk control to text. `agent` and `device` say whose clip it is. */
    transcribe?: (audio: Buffer, context: { agent: string; device: string }) => Promise<string> | string;
  }): ReverseHub;
  poll(): Promise<void>;
  start(options?: { intervalMs?: number }): void;
  stop(): Promise<void>;
  snapshot(): ControllerSnapshot;
}
