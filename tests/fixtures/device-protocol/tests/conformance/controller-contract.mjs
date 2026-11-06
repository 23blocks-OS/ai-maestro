// Any host controller can supply this adapter; no reference CLI or profile folders are used.
import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { identity } from "../../packages/sdk/index.mjs";
import { bridge } from "../../clients/linux/server.mjs";
export function controllerConformance(makeController) {
  async function setup(t) {
    const events = [],
      controller = makeController({ onEvent: (e) => events.push(e) });
    t.after(() => controller.stop());
    const agents = [
      { address: "lola@host.local", identity: identity() },
      { address: "other@host.local", identity: identity() },
    ];
    agents.forEach((a) => controller.addAgent(a));
    const devices = [];
    for (let i = 0; i < 3; i++) {
      const owner = agents[i === 2 ? 1 : 0],
        device = identity();
      let peer = {
          key: owner.identity.key,
          assignedAgent: owner.address,
          camera: true,
          revision: "initial",
        },
        captures = 0,
        capture = async () => ({ mime: "image/jpeg", data: "/9j/2Q==" });
      const server = bridge(device, () => peer, {
        cameraReady: () => true,
        indicatorReady: () => true,
        indicate: async () => {},
        snapshot: async () => {
          captures++;
          return capture();
        },
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      t.after(() => {
        server.close();
        server.closeAllConnections();
      });
      const d = {
        key: device.key,
        endpoint: "http://127.0.0.1:" + server.address().port,
        name: "device" + i,
      };
      await controller.registerDevice(owner.address, d);
      devices.push({
        ...d,
        server,
        get captures() {
          return captures;
        },
        set capture(fn) {
          capture = fn;
        },
        set peer(p) {
          peer = p;
        },
      });
    }
    return { controller, agents, devices, events };
  }
  test("controller conformance: device-free agents need no key", async () => {
    const c = makeController();
    c.addAgent({ address: "plain@host.local" });
    assert.deepEqual(c.inventory("plain@host.local"), []);
    await c.stop();
  });
  test("controller conformance: many agents, device-authoritative ownership and idle refusal", async (t) => {
    const { controller: c, agents: a, devices: d } = await setup(t);
    assert.equal(c.inventory(a[0].address).length, 2);
    assert.equal(c.inventory(a[1].address).length, 1);
    await c.invoke(a[0].address, d[1].key, "device.health");
    await assert.rejects(
      c.invoke(a[0].address, d[1].key, "camera.snapshot"),
      /idle/,
    );
    assert.equal(d[1].captures, 0);
    c.jump(a[0].address, d[0].key);
    assert.equal(
      (await c.invoke(a[0].address, d[0].key, "camera.snapshot")).mime,
      "image/jpeg",
    );
    await assert.rejects(
      c.invoke(a[1].address, d[0].key, "camera.snapshot"),
      /Unknown/,
    );
    d[0].peer = {
      key: a[0].identity.key,
      assignedAgent: a[1].address,
      camera: true,
    };
    await assert.rejects(c.refresh(a[0].address, d[0].key), /another agent/);
    assert.ok(c.inventory(a[0].address).every((d) => !d.active));
    assert.equal(
      c.inventory(a[0].address).find((x) => x.key === d[0].key).owner,
      null,
    );
  });
  test("controller conformance: a jump to the active device changes nothing", async (t) => {
    const { controller: c, agents: a, devices: d } = await setup(t);
    const agent = a[0].address;
    const { generation } = c.jump(agent, d[0].key);
    let release;
    d[0].capture = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const running = c.invoke(agent, d[0].key, "camera.snapshot");
    while (!d[0].captures)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(c.jump(agent, d[0].key).generation, generation);
    release({ mime: "image/jpeg", data: "/9j/2Q==" });
    assert.equal((await running).mime, "image/jpeg");
  });
  test("controller conformance: last jump wins and late old captures cannot escape", async (t) => {
    const { controller: c, agents: a, devices: d } = await setup(t);
    const agent = a[0].address;
    c.jump(agent, d[0].key);
    let release;
    const waiting = new Promise((resolve) => {
      release = resolve;
    });
    d[0].capture = () => waiting;
    const old = c.invoke(agent, d[0].key, "camera.snapshot");
    const rejected = assert.rejects(
      old,
      /active device changed|abort|activation|idle/i,
    );
    while (!d[0].captures)
      await new Promise((resolve) => setTimeout(resolve, 5));
    c.jump(agent, d[1].key);
    release({ mime: "image/jpeg", data: "/9j/2Q==" });
    await rejected;
    await c.invoke(agent, d[1].key, "camera.snapshot");
    c.jump(agent, d[0].key);
    c.jump(agent, d[1].key);
    assert.deepEqual(
      c
        .inventory(agent)
        .filter((d) => d.active)
        .map((d) => d.key),
      [d[1].key],
    );
    d[0].server.close();
    d[0].server.closeAllConnections();
    c.jump(agent, d[1].key);
    assert.equal(
      (await c.invoke(agent, d[1].key, "device.health")).status,
      "ok",
    );
  });
  test("controller conformance: fixed operations and typed arguments only", async (t) => {
    const { controller: c, agents: a, devices: d } = await setup(t);
    c.jump(a[0].address, d[0].key);
    await assert.rejects(
      c.invoke(a[0].address, d[0].key, "shell", { command: "id" }),
      /Unknown/,
    );
    await assert.rejects(
      c.invoke(a[0].address, d[0].key, "camera.snapshot", { path: "/tmp/a" }),
      /arguments/,
    );
  });
}
