import { call, exchange, agentAddress, publicKey, nonce } from "./index.mjs";
import { streamMedia } from "./media.mjs";
import { endpoint } from "./controller-state.mjs";
import {
  builtinCapabilities,
  validateSchema,
  validateArguments,
  imageBytes,
  audioBytes,
} from "./capabilities.mjs";
import { validateChange, sameChange } from "./changes.mjs";
import { ReverseHub } from "./reverse.mjs";

export class Controller {
  constructor({
    onEvent = () => {},
    onStateChange = () => {},
    transport = { call, exchange, streamMedia },
  } = {}) {
    Object.assign(this, { onEvent, onStateChange, transport });
    this.proposals = new Map();
    this.agents = new Map();
    this.pendingEvents = new Map();
    this.deliveries = new Map();
    this.hubs = new Set();
    this.polling = false;
  }
  addAgent({ address, identity }) {
    agentAddress(address);
    if (this.agents.has(address)) throw new Error("Agent already exists");
    if (identity) {
      publicKey(identity.key);
      if (
        [...this.agents.values()].some((a) => a.identity?.key === identity.key)
      )
        throw new Error("Each agent must use its own key");
    }
    this.agents.set(address, {
      address,
      identity,
      devices: new Map(),
      active: null,
      generation: 0,
      operations: new Set(),
    });
  }
  agent(address) {
    const agent = this.agents.get(address);
    if (!agent) throw new Error("Unknown agent");
    return agent;
  }
  device(address, key) {
    const a = this.agent(address),
      d = a.devices.get(key);
    if (!d) throw new Error("Unknown device");
    return [a, d];
  }
  pinDevice(address, { key, endpoint: origin, name = key }) {
    publicKey(key);
    endpoint(origin);
    const a = this.agent(address);
    if (!a.identity)
      throw new Error(
        "Supply this agent’s controller identity before enrolling a device",
      );
    for (const other of this.agents.values()) {
      if (other !== a && other.devices.get(key)?.verified)
        throw new Error("Device still has another verified owner");
    }
    const old = a.devices.get(key);
    a.devices.set(key, {
      ...old,
      key,
      name,
      endpoint: origin,
      verified: old?.verified ?? false,
      state:
        old?.state === "revoked" ? "unverified" : (old?.state ?? "unverified"),
      owner: old?.owner ?? null,
      capabilities: old?.capabilities ?? [],
      failures: 0,
    });
    this.changed();
    return this.inventory(address).find((d) => d.key === key);
  }
  async registerDevice(address, device) {
    this.pinDevice(address, device);
    return this.refresh(address, device.key);
  }
  inventory(address) {
    const a = this.agent(address);
    return [...a.devices.values()].map((d) => ({
      ...structuredClone(d),
      active: a.active === d.key,
    }));
  }
  changed() {
    this.onStateChange(this.snapshot());
  }
  snapshot() {
    return {
      version: 1,
      agents: [...this.agents.values()].map((a) => ({
        address: a.address,
        activeDeviceKey: a.active,
        devices: this.inventory(a.address),
      })),
      pendingEvents: structuredClone([...this.pendingEvents.values()]),
      proposals: structuredClone([...this.proposals.values()]),
    };
  }
  notify(type, a, d, extra = {}) {
    const event = {
      id: nonce(),
      type,
      agent: a.address,
      deviceKey: d.key,
      ...structuredClone(extra),
    };
    if (this.pendingEvents.size >= 1000)
      throw new Error("Event delivery queue full");
    this.pendingEvents.set(event.id, event);
    this.changed();
    void this.deliver(event);
    return structuredClone(event);
  }
  deliver(event) {
    const id = event.id;
    if (this.deliveries.has(id)) return this.deliveries.get(id);
    if (!this.pendingEvents.has(id)) return Promise.resolve();
    // Reserve this ID before invoking application code, including callbacks
    // that synchronously reenter the controller. Polling joins this attempt.
    const delivery = Promise.resolve().then(async () => {
      try {
        await this.onEvent(structuredClone(event));
        this.pendingEvents.delete(id);
        this.changed();
      } catch {
        /* Keep the original event and ID for a later poll. */
      } finally {
        this.deliveries.delete(id);
      }
    });
    this.deliveries.set(id, delivery);
    return delivery;
  }
  invalidate(a, d, state = "revoked") {
    d.authorityGeneration = (d.authorityGeneration ?? 0) + 1;
    d.verified = false;
    d.owner = null;
    if (a.active === d.key) this.jump(a.address, null);
    if (d.state !== state) {
      d.state = state;
      this.notify("device." + state, a, d);
    }
    this.changed();
  }
  async refresh(address, key) {
    const [a, d] = this.device(address, key);
    const authorityGeneration = d.authorityGeneration ?? 0;
    try {
      const registration = await this.transport.call(
        d.endpoint,
        a.identity,
        key,
      );
      if (
        (d.authorityGeneration ?? 0) !== authorityGeneration ||
        a.devices.get(key) !== d
      ) {
        const error = new Error("Discovery superseded by an ownership change");
        error.code = "SUPERSEDED";
        throw error;
      }
      if (registration.assignedAgent !== address) {
        this.invalidate(a, d);
        throw new Error("Device belongs to another agent");
      }
      if (
        !Array.isArray(registration.capabilities) ||
        registration.capabilities.length > 64 ||
        registration.capabilities.some((v) => typeof v !== "string") ||
        !Array.isArray(registration.streams) ||
        registration.streams.some((v) => !["video", "microphone"].includes(v))
      )
        throw new Error("Invalid registration");
      const was = d.state,
        rebooted =
          d.bootId && registration.bootId && d.bootId !== registration.bootId;
      Object.assign(d, {
        bootId: registration.bootId,
        verified: true,
        owner: registration.assignedAgent,
        revision: registration.revision,
        capabilities: registration.capabilities,
        definitions: registration.capabilityDefinitions ?? {},
        streams: registration.streams ?? [],
        permissions: registration.permissions ?? {},
        state: "online",
        failures: 0,
        lastSeen: Date.now(),
      });
      if (was !== "online" || rebooted)
        this.notify("device.online", a, d, { capabilities: d.capabilities });
      this.changed();
      return structuredClone(d);
    } catch (error) {
      if (error.code === "SUPERSEDED") throw error;
      if (/403|another agent/.test(error.message)) this.invalidate(a, d);
      else if (++d.failures >= 3 || typeof d.endpoint === "object") {
        if (d.state !== "offline") {
          d.state = "offline";
          this.notify("device.offline", a, d);
          this.changed();
        }
      }
      throw error;
    }
  }
  jump(address, key) {
    const a = this.agent(address);
    if (key !== null && !a.devices.get(key)?.verified)
      throw new Error("Select a device with verified ownership");
    // Not a change: a person typing at the active device must not cancel what the agent is doing there
    if (a.active === key)
      return { activeDeviceKey: key, generation: a.generation };
    const previous = a.active;
    a.active = key;
    a.generation++;
    for (const operation of a.operations)
      operation.abort(new Error("Active device changed"));
    a.operations.clear();
    this.changed();
    if (key !== null)
      this.notify("device.activated", a, a.devices.get(key), { previous });
    return { activeDeviceKey: key, generation: a.generation };
  }
  guard(a, d, signal) {
    if (a.active !== d.key) throw new Error("Device is idle");
    const generation = a.generation,
      abort = new AbortController();
    a.operations.add(abort);
    const combined = signal
      ? AbortSignal.any([signal, abort.signal])
      : abort.signal;
    return {
      signal: combined,
      check: () => {
        if (combined.aborted) throw combined.reason;
        if (a.active !== d.key || a.generation !== generation)
          throw new Error("Activation changed");
      },
      close: () => a.operations.delete(abort),
    };
  }
  async invoke(address, key, capability, args = {}, { signal } = {}) {
    const [a, d] = this.device(address, key);
    const definition = Object.hasOwn(builtinCapabilities, capability)
      ? builtinCapabilities[capability]
      : /^custom\.[a-z][a-z0-9_-]*\.[a-z][a-z0-9_-]*$/.test(capability)
        ? d.definitions?.[capability]
        : null;
    if (!definition) throw new Error("Unknown capability");
    if (!builtinCapabilities[capability]) validateSchema(definition.args);
    validateArguments(definition.args, args);
    if (capability === "display.image") imageBytes(args);
    if (capability === "speaker.play") audioBytes(args);
    const guard =
      definition.activation === "any" ? null : this.guard(a, d, signal);
    try {
      await this.refresh(address, key);
      guard?.check();
      if (!d.capabilities.includes(capability))
        throw new Error("Capability is not granted or available");
      const fetcher = (url, options) =>
        fetch(url, {
          ...options,
          signal: AbortSignal.any([
            options.signal,
            ...(guard ? [guard.signal] : signal ? [signal] : []),
          ]),
        });
      const result = await this.transport.exchange(
        d.endpoint,
        a.identity,
        key,
        {
          type: "invoke",
          capability,
          ...(Object.keys(args).length ? { args } : {}),
        },
        "result",
        fetcher,
      );
      guard?.check();
      if (!result.ok) throw new Error(result.error);
      return result.value;
    } finally {
      guard?.close();
    }
  }
  async *media(address, key, kind, seconds, { signal } = {}) {
    const [a, d] = this.device(address, key),
      guard = this.guard(a, d, signal);
    try {
      await this.refresh(address, key);
      guard.check();
      if (!d.streams.includes(kind))
        throw new Error("Media is not granted or available");
      for await (const frame of this.transport.streamMedia(
        d.endpoint,
        a.identity,
        key,
        kind,
        seconds,
        guard.signal,
      )) {
        guard.check();
        yield frame;
      }
    } finally {
      guard.close();
    }
  }
  async propose(
    address,
    key,
    change,
    { expectedRevision, requestId = nonce() } = {},
  ) {
    validateChange(change);
    const [a, d] = this.device(address, key),
      existing = this.proposals.get(requestId);
    if (
      existing &&
      (existing.agent !== address ||
        existing.deviceKey !== key ||
        !sameChange(existing.change, change))
    )
      throw new Error("Request ID reused");
    if (existing?.receipt) return existing.receipt;
    if (!existing && this.proposals.size >= 1024)
      throw new Error(
        "Proposal history capacity reached; persist and retire completed records",
      );
    this.proposals.set(requestId, {
      agent: address,
      deviceKey: key,
      requestId,
      change,
    });
    const response = await this.transport.exchange(
      d.endpoint,
      a.identity,
      key,
      {
        type: "proposal",
        requestId,
        change,
        ...(expectedRevision !== undefined ? { expectedRevision } : {}),
      },
      "proposal.ack",
      fetch,
    );
    if (response.requestId !== requestId)
      throw new Error("Uncorrelated proposal");
    if (
      response.status === "confirmed" &&
      ["transfer", "revoke"].includes(change.action)
    )
      this.invalidate(a, d);
    return response;
  }
  route(key) {
    for (const a of this.agents.values()) {
      const d = a.devices.get(key);
      if (d && d.state !== "revoked") return { agent: a, device: d };
    }
    return null;
  }
  createHub(options = {}) {
    const hub = new ReverseHub({
      ...options,
      getDevices: () =>
        Object.fromEntries(
          [...this.agents.values()].flatMap((a) =>
            [...a.devices.values()]
              .filter((d) => d.state !== "revoked")
              .map((d) => [d.key, { agent: a.address }]),
          ),
        ),
      getIdentity: (key) => this.route(key)?.agent.identity,
      onUsed: async (key) => {
        const route = this.route(key);
        if (!route) throw new Error("Unknown device");
        await this.refresh(route.agent.address, key);
        this.jump(route.agent.address, key);
      },
      onProposal: async (key, event) => {
        const pending = this.proposals.get(event.requestId);
        if (
          !pending ||
          pending.deviceKey !== key ||
          pending.agent !== event.assignedAgent ||
          !sameChange(pending.change, event.change)
        )
          throw new Error("Uncorrelated proposal receipt");
        pending.receipt = {
          type: "proposal.ack",
          requestId: event.requestId,
          status: event.status,
          revision: event.revision,
          assignedAgent: event.owner,
        };
        if (
          event.status === "confirmed" &&
          ["transfer", "revoke"].includes(event.change.action)
        ) {
          const [a, d] = this.device(pending.agent, key);
          this.invalidate(a, d);
        }
        this.changed();
      },
      // The host turns speech into text; from there it is ordinary input
      onAudio: async (key, audio) => {
        const route = this.route(key);
        if (!route) throw new Error("Unknown device");
        if (!options.transcribe) throw new Error("No speech to text here");
        await this.refresh(route.agent.address, key);
        this.jump(route.agent.address, key);
        const text = (await options.transcribe(audio)).trim();
        if (text)
          this.notify("device.input", route.agent, route.device, {
            text,
            source: "voice",
          });
      },
      onInput: async (key, text) => {
        const route = this.route(key);
        if (!route) throw new Error("Unknown device");
        await this.refresh(route.agent.address, key);
        this.jump(route.agent.address, key);
        this.notify("device.input", route.agent, route.device, {
          text,
          source: "device",
        });
      },
    });
    hub.on("connected", (key) => {
      const r = this.route(key);
      if (r) void this.refresh(r.agent.address, key).catch(() => {});
    });
    hub.on("disconnected", (key) => {
      const r = this.route(key);
      if (r && r.device.state !== "revoked") {
        r.device.state = "offline";
        this.notify("device.offline", r.agent, r.device);
        this.changed();
      }
    });
    this.hubs.add(hub);
    return hub;
  }
  async poll() {
    if (this.polling) return;
    this.polling = true;
    try {
      const tasks = [...this.agents.values()].flatMap((a) =>
        [...a.devices.keys()].map(
          (key) => () => this.refresh(a.address, key).catch(() => {}),
        ),
      );
      await Promise.all(
        Array.from({ length: Math.min(8, tasks.length) }, async () => {
          while (tasks.length) await tasks.shift()();
        }),
      );
      await Promise.all(
        [...this.pendingEvents.values()].map((event) => this.deliver(event)),
      );
    } finally {
      this.polling = false;
    }
  }
  start({ intervalMs = 3000 } = {}) {
    if (!Number.isInteger(intervalMs) || intervalMs < 100)
      throw new Error("Invalid poll interval");
    if (this.timer) throw new Error("Controller already running");
    this.timer = setInterval(() => void this.poll(), intervalMs);
    void this.poll();
  }
  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    for (const a of this.agents.values())
      for (const op of a.operations) op.abort();
    await Promise.all([...this.hubs].map((h) => h.close()));
    this.hubs.clear();
  }
}
