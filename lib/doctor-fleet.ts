/**
 * Doctor fleet view (docs/SPEC-DOCTOR.md sections 5 and 7): the client has every host's report, so it
 * derives the fleet findings itself. Nothing here calls a host.
 */
import type { DiagnosticCheck, DiagnosticReport, DiagnosticStatus } from '@/services/diagnostics-service'

export interface HostReport {
  hostId: string
  report?: DiagnosticReport | null
  error?: string | null
}

const RANK: Record<DiagnosticStatus, number> = { fail: 0, warn: 1, pass: 2 }
export const CATEGORY_ORDER = ['agents', 'install', 'host', 'peers'] as const
export type Category = typeof CATEGORY_ORDER[number]

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return Math.sign(d)
  }
  return 0
}

const isVersion = (v: unknown): v is string => typeof v === 'string' && /^\d+(\.\d+)*$/.test(v)

/** The checks a host gets from the fleet: unreachable, behind the newest host, or too old for v2. */
export function fleetChecks(hosts: HostReport[]): Record<string, DiagnosticCheck[]> {
  const versions = hosts.map(h => h.report?.version).filter(isVersion)
  const newest = versions.reduce<string | null>((m, v) => (!m || compareVersions(v, m) > 0 ? v : m), null)
  const out: Record<string, DiagnosticCheck[]> = {}
  for (const h of hosts) {
    const checks: DiagnosticCheck[] = []
    if (h.error) {
      checks.push({ name: 'fleet:reachable', status: 'fail', category: 'peers', message: `No report: ${h.error}` })
    } else if (h.report) {
      if (h.report.schema !== 2) {
        checks.push({ name: 'fleet:schema', status: 'warn', category: 'install', message: 'Update this host for the full checks', hint: 'Run ./update-aimaestro.sh -y on this host.' })
      }
      const v = h.report.version
      if (newest && isVersion(v) && compareVersions(v, newest) < 0) {
        checks.push({ name: 'fleet:version', status: 'warn', category: 'install', message: `AI Maestro ${v}; another host runs ${newest}`, hint: 'Run ./update-aimaestro.sh -y on this host.' })
      }
    }
    out[h.hostId] = checks
  }
  return out
}

/**
 * Peer checks (`host:<name>`) worth showing on each card. Every host reports its peers, so a peer is shown
 * once, from the first card that has it, and never when that peer has its own card (its card says whether
 * it answered). A peer only some hosts know, such as one that is down, still shows.
 */
export function peerChecksToShow(hosts: { hostId: string; name: string; checks: DiagnosticCheck[] }[]): Record<string, Set<string>> {
  const seen = new Set(hosts.map(h => `host:${h.name}`))
  const out: Record<string, Set<string>> = {}
  for (const h of hosts) {
    out[h.hostId] = new Set()
    for (const c of h.checks) {
      if (!c.name.startsWith('host:') || seen.has(c.name)) continue
      seen.add(c.name)
      out[h.hostId].add(c.name)
    }
  }
  return out
}

/** Checks grouped by category, failures first; peer checks only those in `peers`. */
export function groupChecks(checks: DiagnosticCheck[], peers: Set<string>): { category: Category; checks: DiagnosticCheck[] }[] {
  const categoryOf = (c: DiagnosticCheck): Category => c.category || (c.name.startsWith('host:') ? 'peers' : 'host')
  const kept = checks.filter(c => !c.name.startsWith('host:') || peers.has(c.name))
  return CATEGORY_ORDER
    .map(category => ({
      category,
      checks: kept.filter(c => categoryOf(c) === category).sort((a, b) => RANK[a.status] - RANK[b.status]),
    }))
    .filter(g => g.checks.length > 0)
}
