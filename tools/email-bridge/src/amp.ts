/**
 * Hand a message to AI Maestro, which delivers it to the agent. Same route the bridge has always used.
 */

import type { Config } from './config.js'
import type { Notify, NotifyArgs } from './engine.js'

export function buildPayload(cfg: Config, a: NotifyArgs) {
  return {
    from: cfg.aimaestro.botAgent,
    fromHost: cfg.aimaestro.hostId,
    to: a.to,
    toHost: cfg.aimaestro.hostId,
    subject: a.out.subject,
    priority: a.out.priority,
    content: { type: 'notification', message: a.out.message, ...(a.email && { email: a.email }) },
  }
}

export function makeNotify(cfg: Config, log: (line: string) => void, fetchImpl: typeof fetch = fetch): Notify {
  return async (a: NotifyArgs) => {
    if (cfg.dryRun) {
      log(`[DRY RUN] would send to ${a.to}${a.email ? ` (UID ${a.email.uid}, ${a.email.trust ?? 'legacy'})` : ' (digest)'}; nothing sent`)
      return true
    }
    try {
      const res = await fetchImpl(`${cfg.aimaestro.apiUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(cfg, a)),
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        log(`send to ${a.to} failed: HTTP ${res.status}`)
        return false
      }
      log(`-> ${a.to}: ${a.email ? `UID ${a.email.uid} (${a.email.trust ?? 'legacy'})` : 'digest'}`)
      return true
    } catch (error) {
      log(`send to ${a.to} failed: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }
}
