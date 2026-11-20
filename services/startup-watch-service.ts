/**
 * Runs the "startup blocked" check (lib/startup-watch) once a minute with the real terminal and hook reports.
 */
import { getRuntime } from '@/lib/agent-runtime'
import { checkStartups, type StartupDeps } from '@/lib/startup-watch'
import { lastHookReport } from '@/services/sessions-service'

const deps: StartupDeps = {
  report: dir => lastHookReport(dir),
  sessionExists: name => getRuntime().sessionExists(name),
  // The visible screen, with escapes so a dim placeholder in an empty input box is not read as text
  capture: name => getRuntime().capturePaneRaw(name, 1),
  now: () => Date.now(),
}

const g = globalThis as { _aimStartupWatcher?: ReturnType<typeof setInterval> }

export function ensureStartupWatcher(): void {
  if (g._aimStartupWatcher || process.env.VITEST) return
  let running = false
  g._aimStartupWatcher = setInterval(() => {
    if (running) return
    running = true
    checkStartups(deps).catch(e => console.warn(`[Startup] check failed: ${e.message}`)).finally(() => { running = false })
  }, 60_000)
  g._aimStartupWatcher.unref?.()
}
