/**
 * Origin guard (B044, docs/SPEC-SECURITY-POSTURE.md part B): refuse browser requests that come from a page
 * which is not an AI Maestro dashboard (cross-site WebSocket hijacking, cross-site POSTs, DNS rebinding).
 * Not authentication: a client that sends no Origin (curl, scripts, the hook, other hosts) is not a browser
 * page and is allowed, as the network is the trust boundary.
 *
 * AIMAESTRO_ORIGIN_GUARD = enforce (default since 0.106.234: refuse) | audit (log what would be refused, refuse nothing) | off
 * AIMAESTRO_TRUSTED_ORIGINS = comma list of extra origins (a reverse proxy), e.g. https://maestro.example.com
 */
import net from 'net'
import os from 'os'

export function guardMode(env = process.env) {
  const m = String(env.AIMAESTRO_ORIGIN_GUARD || '').trim().toLowerCase()
  // Audit ran on every host from 0.106.225 and found nothing legitimate to refuse; an unknown value also enforces
  return m === 'audit' || m === 'off' ? m : 'enforce'
}

export function parseTrustedOrigins(value = '') {
  const origins = new Set()
  for (const raw of String(value).split(',')) {
    try { if (raw.trim()) origins.add(new URL(raw.trim()).origin) } catch { /* not a URL: ignored */ }
  }
  return origins
}

/** "host:port", "[::1]:23000", "http://host:23000" or a bare name -> lowercase hostname without brackets */
export function hostnameOf(value) {
  if (!value) return ''
  const s = String(value).trim().toLowerCase()
  if (s.includes('://')) { try { return new URL(s).hostname.replace(/^\[|\]$/g, '') } catch { return '' } }
  if (s.startsWith('[')) return s.slice(1, s.indexOf(']') > 0 ? s.indexOf(']') : undefined)
  if (net.isIP(s)) return s // a bare IPv6 address has colons but no port
  return s.split(':')[0]
}

const isLoopback = (h) => h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127\./.test(h)

/**
 * A Host name a browser could only have reached by the operator typing it. A DNS rebinding attack carries
 * the attacker's public name instead. `.local` (mDNS) and `.ts.net` (Tailscale MagicDNS) cannot be rebound
 * from public DNS.
 */
function allowedHostName(h, ctx) {
  return !h || isLoopback(h) || net.isIP(h) !== 0 || h.endsWith('.local') || h.endsWith('.ts.net') ||
    ctx.knownHostnames.has(h) || ctx.trustedHostnames.has(h)
}

/**
 * The decision, a pure function of the request headers and the known hosts.
 * checkOrigin: true for WebSocket upgrades and for methods other than GET, HEAD and OPTIONS.
 * ctx: { knownHostnames: Set<string>, trustedOrigins: Set<string> } (trustedHostnames is derived when missing).
 * Returns { ok: true } or { ok: false, reason: 'unknown-host' | 'foreign-origin', origin, host }.
 */
export function decide(headers, checkOrigin, ctx) {
  const trustedHostnames = ctx.trustedHostnames || new Set([...ctx.trustedOrigins].map(hostnameOf))
  const full = { ...ctx, trustedHostnames }
  const host = String(headers.host || '').toLowerCase()
  const origin = headers.origin
  if (!allowedHostName(hostnameOf(host), full)) return { ok: false, reason: 'unknown-host', origin: origin || null, host }
  if (!checkOrigin) return { ok: true }

  const fetchSite = headers['sec-fetch-site']
  if (!origin) {
    // No Origin and no Sec-Fetch-Site: not a browser page (curl, node ws, the hook, other hosts)
    if (!fetchSite || fetchSite === 'same-origin' || fetchSite === 'none') return { ok: true }
    return { ok: false, reason: 'foreign-origin', origin: null, host }
  }
  if (fetchSite === 'same-origin' || fetchSite === 'none') return { ok: true }

  let o
  try { o = new URL(origin) } catch { return { ok: false, reason: 'foreign-origin', origin, host } } // "null" lands here
  const oh = o.hostname.replace(/^\[|\]$/g, '')
  if (o.host === host) return { ok: true } // same origin, http or https; also what the phone app sends (its target)
  if (isLoopback(oh)) return { ok: true }
  if (ctx.knownHostnames.has(oh)) return { ok: true } // another AI Maestro host's dashboard (multi-host view)
  if (ctx.trustedOrigins.has(o.origin)) return { ok: true }
  return { ok: false, reason: 'foreign-origin', origin, host }
}

/** Hostnames of this machine and of every configured host (url and aliases) */
export function buildKnownHostnames({ hosts = [], selfAliases = [], hostname = os.hostname() } = {}) {
  const names = new Set()
  const add = (v) => { const h = hostnameOf(v); if (h) names.add(h) }
  add(hostname)
  if (hostname && !hostname.includes('.')) add(`${hostname}.local`)
  selfAliases.forEach(add)
  for (const h of hosts) {
    add(h.url)
    add(h.id)
    ;(h.aliases || []).forEach(add)
  }
  return names
}

const LOG_EVERY_MS = 60 * 60 * 1000
const MAX_ENTRIES = 500

/**
 * The guard as the server uses it: decide, count, log once per (reason, path, origin, host) per hour.
 * getContext() returns { knownHostnames, trustedOrigins }; the caller caches it.
 */
export function createOriginGuard({ mode = guardMode(), getContext, log = (m) => console.warn(m), now = Date.now } = {}) {
  const entries = new Map()
  let total = 0

  function record(d, path, method) {
    total++
    const key = `${d.reason}|${path}|${d.origin}|${d.host}`
    let e = entries.get(key)
    if (!e) {
      if (entries.size >= MAX_ENTRIES) return
      e = { reason: d.reason, path, method, origin: d.origin, host: d.host, count: 0, first: now(), last: 0, loggedAt: -Infinity }
      entries.set(key, e)
    }
    e.count++
    e.last = now()
    if (now() - e.loggedAt >= LOG_EVERY_MS) {
      e.loggedAt = now()
      const verb = mode === 'enforce' ? 'refused' : 'would refuse (audit)'
      log(`[origin-guard] ${verb} ${method} ${path}: ${d.reason}, Origin ${d.origin ?? '(none)'}, Host ${d.host || '(none)'}`)
    }
  }

  return {
    mode,
    /** { allow, decision }: allow is false only in enforce mode */
    check(req, { upgrade = false } = {}) {
      if (mode === 'off') return { allow: true, decision: { ok: true } }
      const method = (req.method || 'GET').toUpperCase()
      const checkOrigin = upgrade || !['GET', 'HEAD', 'OPTIONS'].includes(method)
      const decision = decide(req.headers || {}, checkOrigin, getContext())
      if (decision.ok) return { allow: true, decision }
      const path = String(req.url || '').split('?')[0]
      record(decision, path, upgrade ? 'WS' : method)
      return { allow: mode !== 'enforce', decision }
    },
    /** True when a browser page of this origin may read answers (CORS reflection in enforce mode) */
    originAllowed(req) {
      return !!req.headers?.origin && decide(req.headers, true, getContext()).ok
    },
    /** For the Doctor: what was (or would have been) refused since the server started */
    stats() {
      return { mode, total, entries: [...entries.values()].map(({ loggedAt, ...e }) => e).sort((a, b) => b.count - a.count) }
    },
  }
}
