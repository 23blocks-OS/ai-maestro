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

const B = path.join(os.homedir(), '.agent-messaging', 'agents')
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/.test(s)
const addrOf = (c) => (c && (c.agent?.address || c.address)) || null

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

const entries = fs.existsSync(B) ? fs.readdirSync(B) : []
const diskByAddr = new Map()   // address -> [dir]
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

const report = {
  registryAgents: reg.length,
  diskDirs: entries.length,
  mismatches,
  duplicateAddressesOnDisk: dupDisk.map(([a, d]) => ({ address: a, dirs: d })),
  duplicateAddressesInRegistry: dupReg.map(([a, x]) => ({ address: a, agents: x.map((y) => y.name) })),
  realNameDirs: realNameDirs.length,
  uuidDirsNoConfig: noConfig.length,
}

if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(0) }

console.log('════════ AMP IDENTITY AUDIT ════════')
console.log(`registry agents: ${report.registryAgents}   |   disk dirs: ${report.diskDirs}`)
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
const clean = mismatches.length === 0 && dupDisk.length === 0 && dupReg.length === 0
console.log('')
console.log(clean ? '✅ No mismatches or shared identities.' : '❌ Identity issues found — repair needed.')
