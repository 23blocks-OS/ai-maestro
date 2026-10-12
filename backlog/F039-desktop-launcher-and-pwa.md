# F039 - A way back in: an `ai-maestro` command, a desktop launcher and a PWA

**Status:** Todo (designed 2026-10-12; built after F040 step 1)
**Type:** Feature (installer)
**Created:** 2026-10-12
**Requested by:** Juan, 2026-10-12 ("a icon in the user desktop or wrapper or PWA so the user can just click there and reopen AI Maestro if they forget about the url and port")

## What exists today

Nothing. There is no PWA manifest, no service worker, only a favicon, and none of the installers create a launcher. People must remember `http://localhost:23000` and start the server themselves.

## Design

1. **An `ai-maestro` command** (`open`, `start`, `stop`, `status`), installed into `~/.local/bin` like `aim-secret` and `safe-psql`. `open` checks whether the server answers; if not it starts it (pm2), waits for it, then opens the dashboard.
2. **A launcher the installer creates and the updater refreshes** (opt out with a flag):
   - macOS: `~/Applications/AI Maestro.app`, built with `osacompile` (on every Mac), with the icon. It calls `ai-maestro open`. Opens a dedicated app window when Chrome or Edge is installed, the default browser otherwise.
   - Linux: a `.desktop` entry with the icon.
   - Windows (WSL): a Start Menu shortcut, later.
3. **PWA:** `app/manifest.ts` with name, icons (192, 512, maskable), `display: standalone`, theme colours, and an apple-touch-icon, so "Install app" and "Add to Dock" work. Limit: browsers only allow PWA install over HTTPS or on `localhost`, so a dashboard reached by a LAN or Tailscale address (`http://100.x:23000`) is not installable; phones can still "Add to Home Screen". The native launcher covers the rest.
4. **Start at login (optional):** a user-level LaunchAgent on macOS (no `sudo`) that brings AI Maestro up at login. It also fixes "pm2 does not start after a reboot" (seen 2026-10-12).
5. Later: a menu-bar status item (running or stopped, start, stop, open).

## Open questions for Juan

1. Dedicated app window when Chrome or Edge is present, or always the default browser? (recommended: app window)
2. Start at login by default, or ask? (recommended: ask during install, default yes on a desktop Mac)
3. Which icon: the site's `icon-512x512.png`, or a new one?

## Tests

The command against a fake pm2 (starts when down, does nothing when up, times out cleanly); the launcher builds and its script calls the command; the installer is idempotent and removable; the manifest validates and its icons exist.

## Size

About 1 day for the command, macOS and Linux launchers and tests; about half a day for the PWA.

## Related

F040 (wake and create UX), `install.sh`, `update-aimaestro.sh`.
