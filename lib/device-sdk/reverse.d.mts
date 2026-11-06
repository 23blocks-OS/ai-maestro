import { EventEmitter } from "node:events";
import { Server } from "node:http";
import type { Identity, Packet } from "./index.mjs";
export class ReverseHub extends EventEmitter {
  constructor(options: {
    identity?: Identity;
    getIdentity?: (key: string) => Identity | undefined;
    getDevices: () => Record<string, { agent: string }>;
    onUsed?: (key: string, event: unknown) => void | Promise<void>;
    onInput?: (key: string, text: string) => void | Promise<void>;
    onProposal?: (
      key: string,
      event: Record<string, unknown>,
    ) => void | Promise<void>;
    heartbeatMs?: number;
    silentMs?: number;
  });
  server: Server;
  connections: ReadonlyMap<string, unknown>;
  close(): Promise<void>;
}
export class DeviceConnection extends EventEmitter {
  constructor(options: {
    origin: string;
    identity: Identity;
    getPeer: () => { key: string; assignedAgent: string };
    adapter: (
      method: "challenge" | "request",
      body: Packet | undefined,
      signal: AbortSignal,
    ) => Promise<{ status: number; body: unknown }>;
    retryMinMs?: number;
    retryMaxMs?: number;
  });
  connected: boolean;
  ready: Promise<void>;
  done: Promise<void>;
  used(): Promise<void>;
  input(text: string): Promise<void>;
  finishProposal(receipt: Record<string, unknown>): Promise<void>;
  stop(): Promise<void>;
}
export function boundedJson(
  response: Response,
  limit?: number,
): Promise<unknown>;
