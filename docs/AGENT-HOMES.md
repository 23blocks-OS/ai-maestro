# Agent homes

The optional `/agent-homes` view reads observations from the AI Maestro Device Protocol controller monitor. Agents without devices continue to work normally. Devices also appear in the assigned agent's profile, matched by full AMP address.

Install and pair the controller and bridge using [the device repository guide](https://github.com/23blocks-OS/ai-maestro-device-protocol/blob/main/docs/agent-tools.md). Run its `monitor` command continuously. Set `ADP_DASHBOARD_DIR` to the same directory for Maestro and the monitor; Maestro defaults to `~/.aimaestro/device-homes`. The monitor requires the variable explicitly. Restart both services after setting it.

The directory has two parts: `status` (monitor writes, Maestro reads) and `requests` (Maestro writes, monitor reads). Keep the parent operator-controlled and configure filesystem access for the service accounts. No device signing key belongs in this directory or in Maestro. A monitor older than 90 seconds is shown as offline.

The page supports camera permission requests, transfers to a new controller public key and full AMP address, and revocation. These requests expire after five minutes and require approval on the device's local screen. A queued request does not change ownership or permission. Transfer resets hardware grants. A revoked record describes the former controller's lost access; it does not grant continued access to that agent. Initial pairing remains local to the device and controller.

`GET /api/agent-homes` and `POST /api/agent-homes` work in full and headless mode. POST accepts `deviceKey`, `agent` (current full AMP address), and `change`: `{"action":"camera","enabled":true}`, `{"action":"revoke"}`, or `{"action":"transfer","agent":"new@host.local","key":"NEW_CONTROLLER_PUBLIC_KEY"}`. The endpoint returns 202 for a queued request. Network access to Maestro has the same trust boundary as its existing operator APIs; the device still requires local confirmation.

Agent chat uses the separate MCP tool server and agent-devices plugin skill. Installing this dashboard alone does not expose hardware tools to a chat session. Automatic speech recognition, speech synthesis, active-device jumping and device-initiated connections are separate features.
