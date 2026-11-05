/**
 * A record of every AMP message this host refused (B006). A 401/403 used to leave only a console.warn on the
 * refusing host's pm2 log: on 2026-09-22, 28 relayed messages were refused for two days before anyone saw why.
 * One JSON line per refusal in ~/.aimaestro/logs/amp-refusals.jsonl, read by the Doctor's amp-refusals check.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'

export interface AmpRefusal {
  at: string
  /** route (local and mesh delivery) or federation (from another provider) */
  endpoint: 'route' | 'federation'
  status: number
  /** The error code returned: invalid_signature, key_revoked, unauthorized, provider_mismatch, ... */
  reason: string
  message?: string
  from?: string
  to?: string
  /** The host that forwarded it (mesh), or the provider that delivered it (federation) */
  via?: string
  fingerprint?: string
}

/** Rotation: past this size the file keeps its newest KEEP_LINES lines */
const MAX_BYTES = 1024 * 1024
const KEEP_LINES = 2000

export function ampRefusalsFile(home = os.homedir()): string {
  return path.join(home, '.aimaestro', 'logs', 'amp-refusals.jsonl')
}

/**
 * Never throws: a refusal must not fail because its record could not be written. Under vitest it writes only
 * to a file the test names, so tests that provoke refusals never touch the real log (as lib/wake-state.ts).
 */
export function recordAmpRefusal(r: Omit<AmpRefusal, 'at'>, fileArg?: string): void {
  const file = fileArg ?? (process.env.VITEST ? null : ampRefusalsFile())
  if (!file) return
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const clip = (s?: string) => (typeof s === 'string' ? s.slice(0, 300) : undefined)
    const line: AmpRefusal = {
      at: new Date().toISOString(),
      endpoint: r.endpoint, status: r.status, reason: clip(r.reason) || 'unknown',
      ...(r.message && { message: clip(r.message) }), ...(r.from && { from: clip(r.from) }), ...(r.to && { to: clip(r.to) }),
      ...(r.via && { via: clip(r.via) }), ...(r.fingerprint && { fingerprint: clip(r.fingerprint)!.slice(0, 24) }),
    }
    fs.appendFileSync(file, JSON.stringify(line) + '\n')
    if (fs.statSync(file).size > MAX_BYTES) {
      const lines = fs.readFileSync(file, 'utf8').trim().split('\n').slice(-KEEP_LINES)
      fs.writeFileSync(file, lines.join('\n') + '\n')
    }
  } catch (error) {
    console.warn('[AMP] Could not record a refusal:', (error as Error).message)
  }
}

/** Refusals at or after `sinceMs`, oldest first; unreadable lines are skipped. */
export function readAmpRefusals(sinceMs: number, file = ampRefusalsFile()): AmpRefusal[] {
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { return [] }
  const out: AmpRefusal[] = []
  for (const l of text.split('\n')) {
    if (!l) continue
    try {
      const r = JSON.parse(l) as AmpRefusal
      if (Date.parse(r.at) >= sinceMs) out.push(r)
    } catch { /* a torn line */ }
  }
  return out
}
