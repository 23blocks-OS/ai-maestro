# B013 - Logs that grow without a limit (hook debug log 373 MB, pm2 log 3.4 GB)

**Status:** Done (0.60.5)
**Type:** Bug (disk growth)
**Created:** 2026-10-07
**Requested by:** Juan, 2026-10-07: cap at 50 MB.

## What was measured (this Mac, 2026-10-07)

- `~/.aimaestro/chat-state/hook-debug.log`: **373 MB**, 495,000 lines, about 890 bytes per line, oldest entry 2026-01-06. The hook (`scripts/claude-hooks/ai-maestro-hook.cjs`, `debugLog`, about line 252) appends the full input of every hook event with `fs.appendFileSync` and never trims or rotates. It did not grow at all over 20 idle seconds; it grows with agent activity (about 2 KB per event, a few MB per day on a busy fleet).
- `logs/pm2-out.log` in the checkout: **3.4 GB**. pm2 does not rotate by default, and nothing in `ecosystem.config.*` or `update-aimaestro.sh` sets rotation.
- Not logs, listed for awareness: per-agent memory databases of 500-700 MB each (`~/.aimaestro/agents/*/agent.db`) and one 4.2 GB backup under `~/.aimaestro/backups/`.

Neither log explains a high CPU or load average. This is a slow disk-space leak (110 GB were free), so it hits small disks and long-lived hosts first. Do not describe it as a cause of slowness.

## Fix

1. **Hook debug log, 50 MB total cap.** Before appending, if the file is over 25 MB, move it to `hook-debug.log.1` (replacing the old one) and start a new file: 25 MB active plus 25 MB previous is the 50 MB ceiling. Cheap check (a `statSync` on each append, or every N appends), never throws, never blocks the hook. Also write less: skip or truncate the large `tool_calls` and prompt fields in `hook_received` entries (cap each logged input at about 2 KB).
2. **pm2 logs, same ceiling.** Configure pm2 rotation (the `pm2-logrotate` module with `max_size 50M`, `retain 2`, `compress false`) from `update-aimaestro.sh` and the installer, idempotently, and document it. Check for other pm2 apps first: rotation settings apply to every app of that pm2.
3. **Existing oversized files:** on update, truncate `hook-debug.log` to its last 25 MB once (keep the tail), do not delete pm2 logs automatically; print the size and the command.
4. **Test:** the rotation helper in isolation with a temporary file (rotates at the threshold, keeps exactly one backup, survives a missing file and a read-only directory without throwing).
5. Check the other `.log` writers under `~/.aimaestro` and `logs/` for the same pattern (a quick grep for `appendFile` without a size check).

## Plugin copy

The hook is copied into the plugin builder: edit only `scripts/claude-hooks/ai-maestro-hook.cjs`, run `scripts/sync-plugin-hook.sh`, then follow the plugin release chain (plugin version bump, PR, pointer).

## Shipped (0.60.5)

- `scripts/setup-log-rotation.sh`: idempotent; installs the pm2-logrotate module (`max_size 50M`, `retain 2`, `compress false`), sets values only when they differ, trims `logs/pm2-out.log`, `pm2-error.log` and `startup.log` past 50 MB and the hook log past 25 MB down to their last 5 MB. Never fails the caller. `AIM_LOG_ROTATION=off` skips it.
- Called by `update-aimaestro.sh` (before the pm2 restart) and by `scripts/remote-install.sh` (after pm2 starts or restarts).
- The hook rotates its own debug log (25 MB active + 25 MB previous, a file far past the cap is cut to its tail) and clips every logged string to 1000 characters, keeping each line valid JSON. Plugin 1.4.4.
- Tests: `tests/log-rotation.test.ts` (17).
- Limits: the module applies to every app pm2 runs on the host; installs without pm2 only get the trim at update time (their `startup.log` is not rotated while running).

## Incident, 2026-10-08 (fixed in 0.60.7)

The first version enabled pm2-logrotate unconditionally. On mini-lola the module copied a 13 GB Slack gateway log over and over (19 GB of copies in ten minutes), the disk reached 100%, pm2 and AI Maestro stopped for about 15 minutes, and the apps had to be restored with `pm2 resurrect`. Cause: the module applies to every pm2 app and rotates by copying. Fix: enable it only with no pm2 log over 1000 MB and 2048 MB free; remove it where unsafe; never trim other apps' logs without `AIM_LOG_ROTATION_TRIM_ALL=1`. Lesson recorded in the tests: a fake pm2 must behave like the real one, and any change that touches files outside our own directory needs a failure-mode test.
