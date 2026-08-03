#!/usr/bin/env node
/**
 * AMP identity repair — gives every contaminated agent a UNIQUE cryptographic
 * identity, reconciling the on-disk AMP store with the AI Maestro registry.
 *
 * Why not amp-init? The contamination jams amp-init's own resolution: when many
 * dirs share one address, amp-init can't disambiguate which agent to re-mint
 * (even with --id). So we mint directly with openssl and update both stores.
 *
 * For each agent whose on-disk keypair is SHARED across dirs, whose registry
 * fingerprint is SHARED across agents, or whose on-disk address is wrong, we:
 *   1. generate a fresh Ed25519 keypair -> <dir>/keys/{private,public}.pem
 *   2. compute its fingerprint (SHA256:base64, the registry format)
 *   3. set the registry entry's metadata.amp.fingerprint to the fresh one
 *   4. set the on-disk config.json address to the registry address + fingerprint
 * so on-disk key <-> registry fingerprint <-> address are consistent and unique.
 *
 * DRY-RUN by default. --apply executes, backing up the AMP store AND registry.json
 * first. Registry address stays as-is (already unique/correct); only fingerprints
 * that were shared get rotated. Run the audit afterward to prove 0 shared keys.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const APPLY = process.argv.includes('--apply')
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7) // optional single agent id, for piloting
const HOME = os.homedir()
const B = path.join(HOME, '.agent-messaging', 'agents')
const REGISTRY = path.join(HOME, '.aimaestro', 'agents', 'registry.json')
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/.test(s)
const addrOf = (c) => (c && (c.agent?.address || c.address)) || null

// SHA256:base64 fingerprint of a PEM public key — matches the registry format.
const fpOfPub = (pubPem) => {
  const der = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'DER'], { input: pubPem })
  // Hash the RAW 32-byte Ed25519 public key (last 32 bytes of the DER SPKI), NOT the
  // full DER — this is what lib/amp-keys.ts calculateFingerprint does. Hashing the DER
  // produces a different fingerprint the server never computes, which breaks conflict
  // detection and the registration duplicate-key check.
  const raw = der.subarray(-32)
  const b64 = execFileSync('openssl', ['dgst', '-sha256', '-binary'], { input: raw })
  return 'SHA256:' + Buffer.from(b64).toString('base64')
}
// did:key derivation (mirrors lib/amp-did.ts) — the canonical self-certifying id.
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const base58btc = (bytes) => {
  let zeros = 0; while (zeros < bytes.length && bytes[zeros] === 0) zeros++
  const digits = [0]
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]
    for (let j = 0; j < digits.length; j++) { carry += digits[j] << 8; digits[j] = carry % 58; carry = (carry / 58) | 0 }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0 }
  }
  let out = '1'.repeat(zeros)
  for (let k = digits.length - 1; k >= 0; k--) out += B58[digits[k]]
  return out
}
const didOfPub = (pubPem) => {
  const der = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'DER'], { input: pubPem })
  return 'did:key:z' + base58btc(Buffer.concat([Buffer.from([0xed, 0x01]), der.subarray(-32)]))
}
const diskFp = (dir) => {
  const f = path.join(dir, 'keys', 'public.pem')
  if (!fs.existsSync(f)) return null
  try { return fpOfPub(fs.readFileSync(f)) } catch { return null }
}
const readCfg = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')) } catch { return null } }

// Registry (source of truth for addresses).
const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'))
const regById = new Map(registry.map((a) => [a.id, a]))
const regAddr = (a) => a?.metadata?.amp?.address || null
const regFp = (a) => a?.metadata?.amp?.fingerprint || null
// Default tenant = the most common amp.tenant in the registry (for deriving
// addresses of agents the registry never recorded an amp.address for).
const tenantCounts = new Map()
for (const a of registry) { const t = a?.metadata?.amp?.tenant; if (t) tenantCounts.set(t, (tenantCounts.get(t) || 0) + 1) }
const TENANT = [...tenantCounts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || 'rnd23blocks'
const deriveAddr = (name) => `${name.toLowerCase()}@${TENANT}.aimaestro.local`

// How many dirs share each on-disk key, and how many registry agents share each fingerprint?
const uuidDirs = fs.readdirSync(B).filter(isUuid)
const diskFpCount = new Map()
for (const d of uuidDirs) { const fp = diskFp(path.join(B, d)); if (fp) diskFpCount.set(fp, (diskFpCount.get(fp) || 0) + 1) }
const regFpCount = new Map()
for (const a of registry) { const fp = regFp(a); if (fp) regFpCount.set(fp, (regFpCount.get(fp) || 0) + 1) }

const remintList = []     // real identity corruption: new key + registry fp + address
const normalizeList = []  // key is fine (unique); just fix config/registry address casing/gap
for (const d of uuidDirs) {
  if (ONLY && d !== ONLY) continue
  const dir = path.join(B, d)
  const ra = regById.get(d)
  if (!ra) continue                              // orphan uuid, not a registry agent
  const registryHadAddr = !!regAddr(ra)
  const correct = regAddr(ra) || deriveAddr(ra.name)
  const dfp = diskFp(dir)
  const cfg = readCfg(dir)
  const diskAddr = addrOf(cfg)
  const sharedKey = dfp && diskFpCount.get(dfp) > 1
  const sharedRegFp = regFp(ra) && regFpCount.get(regFp(ra)) > 1
  const noKey = !dfp
  const wrongAddrCI = diskAddr && diskAddr.toLowerCase() !== correct.toLowerCase()
  const wrongAddrExact = diskAddr && diskAddr !== correct
  if (sharedKey || sharedRegFp || noKey || wrongAddrCI) {
    remintList.push({ id: d, name: ra.name, dir, correctAddr: correct, registryHadAddr,
      reason: [sharedKey && 'shared-key', sharedRegFp && 'shared-registry-fp', noKey && 'no-key', wrongAddrCI && `wrong-addr(${diskAddr})`].filter(Boolean).join(',') })
  } else if (wrongAddrExact || !registryHadAddr || regFp(ra) !== dfp || !ra.metadata?.amp?.did) {
    normalizeList.push({ id: d, name: ra.name, dir, correctAddr: correct, registryHadAddr, diskFp: dfp,
      reason: [wrongAddrExact && 'addr-case', !registryHadAddr && 'registry-gap', regFp(ra) !== dfp && 'registry-fp-drift', !ra.metadata?.amp?.did && 'missing-did'].filter(Boolean).join(',') })
  }
}

console.log(`\n════════ AMP IDENTITY REPAIR ${APPLY ? '(APPLY)' : '(DRY-RUN)'} ════════`)
console.log(`Registry agents: ${registry.length}   |   uuid dirs: ${uuidDirs.length}   |   default tenant: ${TENANT}`)
console.log(`\nRe-mint (fresh unique key): ${remintList.length}`)
for (const p of remintList) console.log(`  RE-MINT    ${p.name}  (${p.id.slice(0, 8)})  [${p.reason}]  → ${p.correctAddr}${p.registryHadAddr ? '' : '  (+registry addr)'}`)
console.log(`\nNormalize only (keep key, fix address/registry): ${normalizeList.length}`)
for (const p of normalizeList) console.log(`  NORMALIZE  ${p.name}  (${p.id.slice(0, 8)})  [${p.reason}]  → ${p.correctAddr}`)

if (!APPLY) {
  console.log('\n(dry-run — nothing changed. Re-run with --apply; backups are taken first.)')
  console.log('(pilot a single agent with --only=<agent-id> --apply before the full run.)')
  process.exit(0)
}

// ---- APPLY ----
const stamp = process.env.REPAIR_STAMP || 'repair'   // caller passes a timestamp; Date.now() unavailable in some runtimes
const bakDir = `${B}.bak-${stamp}`
const bakReg = `${REGISTRY}.bak-${stamp}`
if (!fs.existsSync(bakDir)) { fs.cpSync(B, bakDir, { recursive: true }); console.log(`\nBackup (store):    ${bakDir}`) }
if (!fs.existsSync(bakReg)) { fs.copyFileSync(REGISTRY, bakReg); console.log(`Backup (registry): ${bakReg}`) }

// The SERVER verifies signatures against ~/.aimaestro/agents/<id>/keys/public.pem
// (lib/amp-keys.ts loadKeyPair), a SEPARATE store from the client's signing keys
// in ~/.agent-messaging. Both must hold the same keypair or every signature fails.
const SERVER_KEYS = (id) => path.join(HOME, '.aimaestro', 'agents', id, 'keys')

// Identity Conflict Detection ledger (lib/amp-known-keys.ts). A re-mint is an
// AUTHORIZED key change, so we must update the ledger to the new fingerprint —
// otherwise the running server would 409 (key_conflict) the re-minted agents on
// their next message. Loaded once, saved once at the end.
const LEDGER = path.join(HOME, '.aimaestro', 'amp', 'known-keys.json')
let ledger = {}
try { ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8')) } catch { /* empty/absent = fine */ }

// writes on-disk config + registry entry + SERVER public key + conflict ledger
const writeIdentity = (p, fp, pubPem) => {
  const cfg = readCfg(p.dir) || {}
  if (cfg.agent) { cfg.agent.address = p.correctAddr; cfg.agent.fingerprint = fp }
  cfg.address = p.correctAddr
  cfg.fingerprint = fp
  fs.writeFileSync(path.join(p.dir, 'config.json'), JSON.stringify(cfg, null, 2))
  const ra = regById.get(p.id)
  ra.metadata = ra.metadata || {}
  ra.metadata.amp = ra.metadata.amp || {}
  ra.metadata.amp.fingerprint = fp
  if (!p.registryHadAddr) { ra.metadata.amp.address = p.correctAddr; ra.metadata.amp.tenant = ra.metadata.amp.tenant || TENANT }
  // sync the server-side verification key + stamp the canonical did:key
  if (pubPem) {
    const sk = SERVER_KEYS(p.id)
    fs.mkdirSync(sk, { recursive: true })
    fs.writeFileSync(path.join(sk, 'public.pem'), pubPem)
    ra.metadata.amp.did = didOfPub(pubPem)   // self-certifying id, derived from the key
  }
  // authorized rotation: drop any stale ledger entry for this address so the
  // server re-records it via TOFU (first_contact) with its OWN fingerprint format
  // on the agent's next message. Deleting (vs writing a fp here) is format-proof.
  delete ledger[p.correctAddr.toLowerCase()]
}

let ok = 0, fail = 0
for (const p of remintList) {
  try {
    const keysDir = path.join(p.dir, 'keys')
    fs.mkdirSync(keysDir, { recursive: true })
    const priv = path.join(keysDir, 'private.pem')
    const pub = path.join(keysDir, 'public.pem')
    execFileSync('openssl', ['genpkey', '-algorithm', 'ed25519', '-out', priv])   // fresh unique keypair
    execFileSync('openssl', ['pkey', '-in', priv, '-pubout', '-out', pub])
    fs.chmodSync(priv, 0o600)
    const pubPem = fs.readFileSync(pub)
    writeIdentity(p, fpOfPub(pubPem), pubPem)
    ok++; console.log(`  ✓ re-mint    ${p.name}`)
  } catch (e) { fail++; console.log(`  ✗ ${p.name}: ${String(e.message || e).slice(0, 140)}`) }
}
for (const p of normalizeList) {
  try {
    // prefer the client signing key; fall back to the server verify-key so agents
    // that have a registered key but no local client key still get a fingerprint + did
    const clientPub = path.join(p.dir, 'keys', 'public.pem')
    const serverPub = path.join(SERVER_KEYS(p.id), 'public.pem')
    const pubPem = fs.existsSync(clientPub) ? fs.readFileSync(clientPub)
                 : (fs.existsSync(serverPub) ? fs.readFileSync(serverPub) : null)
    const fp = pubPem ? fpOfPub(pubPem) : p.diskFp   // fp from the actual key we found
    writeIdentity(p, fp, pubPem)   // align address + registry fp + server key + did
    ok++; console.log(`  ✓ normalize  ${p.name}`)
  } catch (e) { fail++; console.log(`  ✗ ${p.name}: ${String(e.message || e).slice(0, 140)}`) }
}
// Registry-based did backfill: catch agents that have a registered key but no
// client AMP dir (system/test agents) — the dir-based loops above never see them.
for (const ra of registry) {
  if (ra?.metadata?.amp?.fingerprint && !ra?.metadata?.amp?.did) {
    const sp = path.join(SERVER_KEYS(ra.id), 'public.pem')
    if (fs.existsSync(sp)) {
      try { ra.metadata.amp.did = didOfPub(fs.readFileSync(sp)); ok++; console.log(`  ✓ did-backfill ${ra.name}`) }
      catch (e) { console.log(`  ✗ did-backfill ${ra.name}: ${String(e.message || e).slice(0, 80)}`) }
    }
  }
}

// write registry back atomically
const tmp = `${REGISTRY}.tmp-${stamp}`
fs.writeFileSync(tmp, JSON.stringify(registry, null, 2))
fs.renameSync(tmp, REGISTRY)

// write the conflict-detection ledger atomically (updated for every re-minted key)
fs.mkdirSync(path.dirname(LEDGER), { recursive: true })
const ltmp = `${LEDGER}.tmp-${stamp}`
fs.writeFileSync(ltmp, JSON.stringify(ledger, null, 2))
fs.renameSync(ltmp, LEDGER)

console.log(`\nRe-minted: ${ok} ok, ${fail} failed. Conflict ledger pruned for re-minted agents (TOFU rebuilds; ${Object.keys(ledger).length} entries remain).`)
console.log('Restart AI Maestro so it reloads the registry, then verify:')
console.log('  pm2 restart ai-maestro && node scripts/amp-identity-audit.mjs')
