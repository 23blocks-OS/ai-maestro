import { EventEmitter } from "node:events";
import { Server } from "node:http";
import type { Identity, Packet } from "./index.mjs";
export class ReverseHub extends EventEmitter {
  constructor(options: {
    identity?: Identity;
    getIdentity?: (key: string) => Identity | undefined;
    getDevices: () => Record<string, { agent: string }>;
    onUsed?: (key: string, event: unknown) => void | Promise<void>;
    onInput?: (
      key: string,
      text: string,
      from: { via?: string },
    ) => void | Promise<void>;
    onProposal?: (
      key: string,
      event: Record<string, unknown>,
    ) => void | Promise<void>;
    heartbeatMs?: number;
    silentMs?: number;
    /** Which source addresses count as a home network (default: private IPv4 ranges) */
    isHome?: (address: string | undefined) => boolean;
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
    /** S003: connect to /v1/secure, encrypted; may use a home network address; never falls back to /v1/connect */
    secure?: boolean;
  });
  connected: boolean;
  ready: Promise<void>;
  done: Promise<void>;
  used(): Promise<void>;
  /** `via`: the voice assistant that relayed the words, such as "siri" */
  input(text: string, options?: { via?: string }): Promise<void>;
  finishProposal(receipt: Record<string, unknown>): Promise<void>;
  stop(): Promise<void>;
}
export function boundedJson(
  response: Response,
  limit?: number,
): Promise<unknown>;
/** A private (home network) IPv4 address: 10/8, 172.16/12 or 192.168/16 */
export function homeAddress(address: string | undefined): boolean;
/** A controller origin for an encrypted connection: loopback, Tailscale or a home network IPv4 address */
export function secureOrigin(value: string): string;

