#!/usr/bin/env node
/**
 * AMP identity audit — reconcile the AI Maestro registry (source of truth) with
 * the on-disk AMP store (~/.agent-messaging/agents/*). Reports:
 *   - mismatches: a uuid dir's config identity ≠ the registry identity
 *   - DUPLICATE addresses: one AMP address claimed by >1 uuid dir or >1 agent
 *     (the actual "shared identity" bug — must be zero)
 *   - real name-dirs that should be symlinks to uuid dirs (migration debt)
 *   - uuid dirs with no/invalid config
 *
 * Read-only. Use --json for machine output.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const B = path.join(os.homedir(), '.agent-messaging', 'agents')
const SERVER = path.join(os.homedir(), '.aimaestro', 'agents')   // server-side verify-key store
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/.test(s)
const addrOf = (c) => (c && (c.agent?.address || c.address)) || null
// SHA256:base64 fingerprint of a public.pem — the real identity.
const fpOf = (f) => {
  if (!fs.existsSync(f)) return null
  try {
    const der = execFileSync('openssl', ['pkey', '-pubin', '-in', f, '-outform', 'DER'])
    // Hash the RAW 32-byte Ed25519 key (not the DER) to match lib/amp-keys
    // calculateFingerprint and the registry's canonical fingerprint format.
    const bin = execFileSync('openssl', ['dgst', '-sha256', '-binary'], { input: der.subarray(-32) })
    return 'SHA256:' + Buffer.from(bin).toString('base64')
  } catch { return null }
}
const diskFp = (dir) => fpOf(path.join(dir, 'keys', 'public.pem'))
const serverFp = (id) => fpOf(path.join(SERVER, id, 'keys', 'public.pem'))

async function loadRegistry() {
  const r = await fetch('http://localhost:23000/api/agents')
  const { agents = [] } = await r.json()
  return agents
}

function readConfig(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')) } catch { return null }
}

const reg = await loadRegistry()
const regById = new Map(reg.map((a) => [a.id, a]))
const regAddr = (a) => (a.metadata?.amp || a.amp || {}).address || null

// registry-side duplicate addresses
const regByAddr = new Map()
for (const a of reg) {
  const addr = regAddr(a)
  if (!addr) continue
  ;(regByAddr.get(addr) || regByAddr.set(addr, []).get(addr)).push(a)
}

// registry-side shared FINGERPRINTS (the actual identity — one key across many agents)
const regByFp = new Map()
for (const a of reg) {
  const fp = (a.metadata?.amp || a.amp || {}).fingerprint
  if (!fp) continue
  ;(regByFp.get(fp) || regByFp.set(fp, []).get(fp)).push(a)
}

const entries = fs.existsSync(B) ? fs.readdirSync(B) : []
const diskByAddr = new Map()   // address -> [dir]
const diskByKey = new Map()    // on-disk key fingerprint -> [dir]
const mismatches = []
const realNameDirs = []
const noConfig = []

for (const e of entries) {
  const p = path.join(B, e)
  let st
  try { st = fs.lstatSync(p) } catch { continue }
  if (!isUuid(e)) {
    if (!st.isSymbolicLink()) realNameDirs.push(e)
    continue
  }
  const fp = diskFp(p)
  if (fp) (diskByKey.get(fp) || diskByKey.set(fp, []).get(fp)).push(e)
  const cfg = readConfig(p)
  const addr = addrOf(cfg)
  if (!addr) { noConfig.push(e); continue }
  ;(diskByAddr.get(addr) || diskByAddr.set(addr, []).get(addr)).push(e)
  const ra = regById.get(e)
  if (ra) {
    const rAddr = regAddr(ra)
    if (rAddr && rAddr !== addr) mismatches.push({ id: e, name: ra.name, registry: rAddr, disk: addr })
  }
}

const dupDisk = [...diskByAddr.entries()].filter(([, d]) => d.length > 1)
const dupReg = [...regByAddr.entries()].filter(([, a]) => a.length > 1)
const dupKey = [...diskByKey.entries()].filter(([, d]) => d.length > 1)
const dupRegFp = [...regByFp.entries()].filter(([, a]) => a.length > 1)

// Server-side verify-key store (~/.aimaestro/agents/<id>/keys): must be UNIQUE and
// must MATCH the client signing key, or signature verification fails/collides.
const serverByKey = new Map()
const keyStoreMismatch = []
for (const a of reg) {
  const sfp = serverFp(a.id)
  if (sfp) (serverByKey.get(sfp) || serverByKey.set(sfp, []).get(sfp)).push(a.name)
  const cfp = diskFp(path.join(B, a.id))
  if (sfp && cfp && sfp !== cfp) keyStoreMismatch.push({ name: a.name, client: cfp.slice(0, 20), server: sfp.slice(0, 20) })
}
const dupServerKey = [...serverByKey.entries()].filter(([, n]) => n.length > 1)

const report = {
  registryAgents: reg.length,
  diskDirs: entries.length,
  mismatches,
  sharedKeysOnDisk: dupKey.map(([fp, d]) => ({ fingerprint: fp, count: d.length, dirs: d.map((x) => x.slice(0, 8)) })),
  sharedFingerprintsInRegistry: dupRegFp.map(([fp, a]) => ({ fingerprint: fp, count: a.length, agents: a.map((y) => y.name) })),
  duplicateAddressesOnDisk: dupDisk.map(([a, d]) => ({ address: a, dirs: d })),
  duplicateAddressesInRegistry: dupReg.map(([a, x]) => ({ address: a, agents: x.map((y) => y.name) })),
  realNameDirs: realNameDirs.length,
  uuidDirsNoConfig: noConfig.length,
}

if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(0) }

console.log('════════ AMP IDENTITY AUDIT ════════')
console.log(`registry agents: ${report.registryAgents}   |   disk dirs: ${report.diskDirs}`)
console.log('')
console.log(`🔑 SHARED KEYS on disk — one keypair across multiple agents: ${dupKey.length}`)
dupKey.slice(0, 10).forEach(([fp, d]) => console.log(`    ${fp.slice(0, 28)}…  →  ${d.length} dirs`))
console.log('')
console.log(`🔑 SHARED FINGERPRINTS in registry — one identity across agents: ${dupRegFp.length}`)
dupRegFp.slice(0, 10).forEach(([fp, a]) => console.log(`    ${fp.slice(0, 28)}…  →  ${a.length} agents`))
console.log('')
console.log(`🔑 SHARED SERVER verify-keys — one key across agents: ${dupServerKey.length}`)
dupServerKey.slice(0, 10).forEach(([fp, a]) => console.log(`    ${fp.slice(0, 28)}…  →  ${a.length} agents`))
console.log('')
console.log(`🔑 client↔server KEY-STORE mismatches (signatures would fail): ${keyStoreMismatch.length}`)
keyStoreMismatch.slice(0, 10).forEach((m) => console.log(`    ${m.name}  client=${m.client}  server=${m.server}`))
console.log('')
console.log(`✗ registry↔disk MISMATCHES: ${mismatches.length}`)
mismatches.slice(0, 30).forEach((m) => console.log(`    ${m.name} (${m.id.slice(0, 8)})  reg=${m.registry}  disk=${m.disk}`))
console.log('')
console.log(`⚠ SHARED IDENTITY — same address, multiple disk dirs: ${dupDisk.length}`)
dupDisk.slice(0, 30).forEach(([a, d]) => console.log(`    ${a}  →  ${d.map((x) => x.slice(0, 8)).join(', ')}`))
console.log('')
console.log(`⚠ SHARED IDENTITY — same address, multiple registry agents: ${dupReg.length}`)
dupReg.slice(0, 30).forEach(([a, x]) => console.log(`    ${a}  →  ${x.map((y) => y.name).join(', ')}`))
console.log('')
console.log(`○ real name-dirs (should be symlinks): ${report.realNameDirs}`)
console.log(`○ uuid dirs with no/invalid config: ${report.uuidDirsNoConfig}`)
const clean = mismatches.length === 0 && dupDisk.length === 0 && dupReg.length === 0 && dupKey.length === 0 && dupRegFp.length === 0 && dupServerKey.length === 0 && keyStoreMismatch.length === 0
console.log('')
console.log(clean ? '✅ No shared keys, fingerprints, addresses, or mismatches.' : '❌ Identity issues found — repair needed.')
process.exit(clean ? 0 : 1)
