import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  rmSync,
  lstatSync,
} from "node:fs";
import { join } from "node:path";
import { nonce, publicKey, agentAddress, privateOrigin } from "./index.mjs";

export function endpoint(value) {
  if (typeof value === "string") return privateOrigin(value);
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).join() !== "reverse"
  )
    throw new Error("Invalid device endpoint");
  return { reverse: privateOrigin(value.reverse) };
}
export class ControllerState {
  constructor(directory) {
    this.directory = directory;
  }
  read(name, fallback) {
    try {
      return JSON.parse(readFileSync(join(this.directory, name), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return fallback;
      throw error;
    }
  }
  write(name, value) {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const temp = join(this.directory, nonce() + ".tmp");
    writeFileSync(temp, JSON.stringify(value, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temp, join(this.directory, name));
  }
  registry() {
    let value = this.read("controller.json", null);
    if (!value) {
      const legacy = this.read("peer.json", null);
      value = { version: 2, agent: null, devices: {} };
      if (legacy && !legacy.assignedAgent) {
        publicKey(legacy.key);
        value.devices[legacy.key] = {
          name: "legacy",
          key: legacy.key,
          origin: null,
        };
        this.write("controller.json", value);
        if (!this.read("active.json", null)) this.jump(legacy.key);
      }
      return value;
    }
    if (value.version !== 2) {
      const old = value;
      value = { version: 2, agent: agentAddress(old.agent), devices: {} };
      for (const [name, device] of Object.entries(old.devices ?? {}))
        value.devices[device.key] = { ...device, name };
      this.write("controller.json", value);
      if (!this.read("active.json", null)) {
        const keys = Object.keys(value.devices);
        this.jump(keys.length === 1 ? keys[0] : null);
      }
    }
    if (value.agent !== null) agentAddress(value.agent);
    if (
      !value.devices ||
      Array.isArray(value.devices) ||
      Object.keys(value.devices).length > 16
    )
      throw new Error("Invalid device registry");
    const names = new Set();
    for (const [key, device] of Object.entries(value.devices)) {
      publicKey(key);
      if (
        device.key !== key ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(device.name) ||
        names.has(device.name)
      )
        throw new Error("Invalid device entry");
      names.add(device.name);
      if (device.origin !== null) endpoint(device.origin);
    }
    return value;
  }
  add(name, origin, key, agent) {
    publicKey(key);
    agentAddress(agent);
    endpoint(origin);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name))
      throw new Error("Invalid device name");
    const current = this.registry();
    if (current.agent && current.agent !== agent)
      throw new Error("Registry belongs to another agent");
    if (
      Object.values(current.devices).some(
        (d) => d.name === name && d.key !== key,
      )
    )
      throw new Error("Device name already used");
    if (!current.devices[key] && Object.keys(current.devices).length >= 16)
      throw new Error("Device limit reached");
    const first = Object.keys(current.devices).length === 0;
    current.agent = agent;
    current.devices[key] = { name, origin: endpoint(origin), key };
    this.write("controller.json", current);
    if (first) this.jump(key);
    return current;
  }
  lock(fn) {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const lock = join(this.directory, "active.lock"),
      deadline = Date.now() + 3000;
    for (;;) {
      try {
        mkdirSync(lock, { mode: 0o700 });
        break;
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        try {
          const pid = Number(readFileSync(join(lock, "pid"), "utf8"));
          try {
            process.kill(pid, 0);
          } catch (e) {
            if (e.code === "ESRCH") {
              rmSync(lock, { recursive: true });
              continue;
            }
            throw e;
          }
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        if (Date.now() > deadline)
          throw new Error("Controller activation is busy");
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
    }
    try {
      writeFileSync(join(lock, "pid"), String(process.pid), { mode: 0o600 });
      return fn();
    } finally {
      rmSync(lock, { recursive: true, force: true });
    }
  }
  active() {
    return this.read("active.json", { key: null, epoch: null });
  }
  // One atomic rename is the activation point. No network operation or lease participates.
  jump(key) {
    if (key !== null) publicKey(key);
    return this.lock(() => {
      const current = this.active();
      if (current.epoch && current.key === key) return current;
      const value = {
        key,
        epoch: nonce(),
        order: (current.order ?? 0) + 1,
      };
      this.write("active.json", value);
      return value;
    });
  }
  clearIfActive(key) {
    this.lock(() => {
      const current = this.active();
      if (current.key === key)
        this.write("active.json", {
          key: null,
          epoch: nonce(),
          order: (current.order ?? 0) + 1,
        });
    });
  }
  guard(key, signal) {
    const expected = this.active();
    const abort = new AbortController();
    const check = () => {
      const current = this.active();
      if (current.key !== key || current.epoch !== expected.epoch) {
        abort.abort(new Error("Device is idle or activation changed"));
        throw abort.signal.reason;
      }
      if (signal?.aborted) throw signal.reason;
    };
    check();
    const timer = setInterval(() => {
      try {
        check();
      } catch {
        abort.abort();
      }
    }, 20);
    return {
      check,
      signal: signal ? AbortSignal.any([signal, abort.signal]) : abort.signal,
      close: () => clearInterval(timer),
    };
  }
}
