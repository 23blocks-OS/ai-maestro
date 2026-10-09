/**
 * F029 item 1: the Next.js routes (every route.ts under app/) and the headless router
 * (services/headless-router.ts) must serve the same (method, path) set and call the
 * same service functions. B012 was every way these two drifted apart.
 *
 * Limits of the static comparison, so nobody trusts it more than it deserves:
 *   - It compares the NAMES of exported service functions each handler calls
 *     (functions exported from services/*.ts), not their arguments, defaults or
 *     status codes. Argument-level parity is tests/headless-parity-args.test.ts.
 *   - A handler that calls no service function (inline logic, a lib helper) compares
 *     as an empty set on both sides; a route that moved its logic back out of a
 *     service would still pass when the other side did the same.
 *   - Import aliases in the router are resolved (`listMessages as listAgentMessages`);
 *     dynamic `await import()` calls in handlers are read as the destructured names.
 *   - Names in comments or strings count; a handler mentioning a service name only in
 *     a comment would be a false match.
 * Add a route on one side only and this test fails; fix the route, or list it in an
 * allowlist below WITH A REASON.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { listRoutes } from '@/services/headless-router'

const root = path.join(__dirname, '..')
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

// ---- allowlists (every entry needs a reason) -------------------------------

/** Next routes with no headless twin. Key: `METHOD /normalised/path`. */
const NEXT_ONLY: Record<string, string> = {
  'POST /api/agents/[]/files':
    'multipart upload with server-side proxy to the agent host; headless has only the single-purpose import multipart parser, no reusable body parser (documented gap in B012)',
}

/** Headless routes with no Next twin. */
const HEADLESS_ONLY: Record<string, string> = {
  'GET /api/teams/[]/tasks/[]':
    'headless answers 405 for a route Next does not define (Next returns 405 for an unexported method by itself)',
}

/** Pairs whose handlers legitimately call different service functions. */
const METADATA_REASON =
  'Next reads/writes lib/agent-registry directly ("No service function exists for metadata yet"); headless goes through agents-core-service getAgentById/updateAgentById. Error bodies and the PATCH failure status (Next 400) were NOT compared; unverified drift, candidate for a metadata service'
const SERVICE_DIFFERENCES: Record<string, string> = {
  'GET /api/agents/[]/metadata': METADATA_REASON,
  'PATCH /api/agents/[]/metadata': METADATA_REASON,
  'DELETE /api/agents/[]/metadata': METADATA_REASON,
}

// ---- Next side -------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name === 'route.ts') out.push(p)
  }
  return out
}

const normalise = (p: string) => p.replace(/\[[^\]]+\]/g, '[]')

interface NextRoute { key: string; services: Set<string>; file: string }

function serviceNames(): Set<string> {
  const names = new Set<string>()
  // service-errors.ts holds result helpers (isServiceError, notFound, ...), not services
  for (const f of fs.readdirSync(path.join(root, 'services')).filter((n) => n.endsWith('.ts') && n !== 'service-errors.ts')) {
    const src = fs.readFileSync(path.join(root, 'services', f), 'utf8')
    for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) names.add(m[1])
  }
  return names
}
const SERVICE_NAMES = serviceNames()

function calledServices(source: string): Set<string> {
  const found = new Set<string>()
  // Any mention counts (a call can be spelled `(0, mod.fn)(...)` after the test transform)
  for (const m of source.matchAll(/\b(\w+)\b/g)) if (SERVICE_NAMES.has(m[1])) found.add(m[1])
  return found
}

function nextRoutes(): NextRoute[] {
  const out: NextRoute[] = []
  for (const file of walk(path.join(root, 'app'))) {
    const rel = path.relative(path.join(root, 'app'), path.dirname(file)).split(path.sep).join('/')
    const route = normalise('/' + rel)
    const src = fs.readFileSync(file, 'utf8')
    for (const method of METHODS) {
      const re = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\s*=`)
      const m = re.exec(src)
      if (!m) continue
      // The handler body runs to the next exported function/const (or the end of the file)
      const rest = src.slice(m.index + m[0].length)
      const next = rest.search(/\nexport\s+(?:async\s+)?(?:function|const)\s/)
      const body = next === -1 ? rest : rest.slice(0, next)
      out.push({ key: `${method} ${route}`, services: calledServices(body), file: path.relative(root, file) })
    }
  }
  return out
}

// ---- headless side ---------------------------------------------------------

/** `import { a as b }` aliases from the router source: alias -> original */
function routerAliases(): Record<string, string> {
  const src = fs.readFileSync(path.join(root, 'services/headless-router.ts'), 'utf8')
  const aliases: Record<string, string> = {}
  for (const m of src.matchAll(/\b(\w+)\s+as\s+(\w+)\b/g)) aliases[m[2]] = m[1]
  return aliases
}

function headlessRoutes() {
  const aliases = routerAliases()
  return listRoutes().map((r) => {
    const names = new Set<string>()
    // vitest transforms imports to `__vi_import_N__.name(`; the name is what we want
    for (const m of r.handler.matchAll(/\b(\w+)\b/g)) {
      const resolved = aliases[m[1]] ?? m[1]
      if (SERVICE_NAMES.has(resolved)) names.add(resolved)
    }
    return { key: `${r.method} ${normalise(r.path)}`, services: names }
  })
}

// ---- the tests -------------------------------------------------------------

describe('route parity: Next routes vs headless router', () => {
  const next = nextRoutes()
  const headless = headlessRoutes()
  const nextKeys = new Set(next.map((r) => r.key))
  const headlessKeys = new Set(headless.map((r) => r.key))

  it('finds a plausible number of routes on both sides', () => {
    expect(next.length).toBeGreaterThan(140)
    expect(headless.length).toBeGreaterThan(200)
  })

  it('every Next route has a headless twin (or an allowlisted reason)', () => {
    const missing = [...nextKeys].filter((k) => !headlessKeys.has(k) && !(k in NEXT_ONLY))
    expect(missing, 'Next routes with no headless handler: add one in services/headless-router.ts or allowlist with a reason').toEqual([])
  })

  it('every headless route has a Next twin (or an allowlisted reason)', () => {
    const extra = [...headlessKeys].filter((k) => !nextKeys.has(k) && !(k in HEADLESS_ONLY))
    expect(extra, 'headless routes with no Next route').toEqual([])
  })

  it('the allowlists contain only real gaps (no stale entries)', () => {
    expect(Object.keys(NEXT_ONLY).filter((k) => !nextKeys.has(k) || headlessKeys.has(k))).toEqual([])
    expect(Object.keys(HEADLESS_ONLY).filter((k) => !headlessKeys.has(k) || nextKeys.has(k))).toEqual([])
    expect(Object.keys(SERVICE_DIFFERENCES).filter((k) => !nextKeys.has(k) || !headlessKeys.has(k))).toEqual([])
  })

  it('has no duplicate (method, path) in the headless table (a shadowed route never runs)', () => {
    const seen = new Map<string, number>()
    for (const r of listRoutes()) seen.set(`${r.method} ${r.path}`, (seen.get(`${r.method} ${r.path}`) ?? 0) + 1)
    expect([...seen].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([])
  })

  it('no parameterized headless route is registered before a static route it would shadow', () => {
    // matchRoute is first-match-wins: `DELETE /api/sessions/[id]` before `DELETE /api/sessions/restore`
    // made restore unreachable (B012 item 4).
    const table = listRoutes()
    const shadowed: string[] = []
    table.forEach((a, i) => {
      if (!a.path.includes('[')) return
      const re = new RegExp('^' + a.path.replace(/[.*+?^${}()|\\]/g, '\\$&').replace(/\\\[[^\]]+\\\]/g, '[^/]+') + '$')
      for (const b of table.slice(i + 1)) {
        if (b.method === a.method && !b.path.includes('[') && re.test(b.path)) shadowed.push(`${a.method} ${a.path} shadows ${b.path}`)
      }
    })
    expect(shadowed).toEqual([])
  })

  it('each pair calls the same service functions (coarse static comparison, see header)', () => {
    const hl = new Map(headless.map((r) => [r.key, r.services]))
    const diffs: string[] = []
    for (const r of next) {
      const h = hl.get(r.key)
      if (!h || r.key in SERVICE_DIFFERENCES) continue
      const a = [...r.services].sort().join(',')
      const b = [...h].sort().join(',')
      if (a !== b) diffs.push(`${r.key}\n    next:     ${a || '(none)'}  [${r.file}]\n    headless: ${b || '(none)'}`)
    }
    expect(diffs, 'service-call sets differ; align the handlers or add to SERVICE_DIFFERENCES with a reason').toEqual([])
  })
})
