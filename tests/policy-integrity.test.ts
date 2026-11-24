/**
 * The rules file an agent cannot move or switch off: AIMAESTRO_POLICY_FILE (a place the server only reads),
 * AIMAESTRO_POLICY_FAIL_CLOSED (a missing or broken file refuses what agents send), and the last good version, which
 * comes from this process first and never from a copy next to a configured file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { checkPolicyRules } from '@/services/doctor-checks'
import type { PolicyReport } from '@/services/policy-service'

const DENY = JSON.stringify({ version: 2, rules: [{ id: 'no-payroll', effect: 'deny', from: 'agent:*', to: 'agent:payroll' }] })
const ALLOW_ALL = JSON.stringify({ version: 2, default: 'allow', rules: [] })

let dir: string
let home: string
let warn: ReturnType<typeof vi.spyOn>

/** A new server process: nothing in memory */
async function fresh() {
  vi.resetModules()
  return import('@/lib/policy')
}
const touch = (f: string, text: string, ahead = 5000) => { fs.writeFileSync(f, text); fs.utimesSync(f, new Date(), new Date(Date.now() + ahead)) }

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-integrity-'))
  home = path.join(dir, 'home')
  fs.mkdirSync(path.join(home, '.aimaestro'), { recursive: true })
  vi.stubEnv('HOME', home)
  vi.stubEnv('AIMAESTRO_POLICY_FILE', '')
  vi.stubEnv('AIMAESTRO_POLICY_FAIL_CLOSED', '')
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warn.mockRestore()
  vi.unstubAllEnvs()
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('a deleted rules file (default place)', () => {
  it('replacing the file with allow-all makes allow-all the last good version, so deleting it then allows', async () => {
    // The reported case: the agent's own replacement had loaded before the delete
    const { loadPolicy } = await fresh()
    const file = path.join(home, '.aimaestro', 'policy.json')
    fs.writeFileSync(file, DENY)
    expect(loadPolicy().rules).toHaveLength(1)
    touch(file, ALLOW_ALL)
    expect(loadPolicy().rules).toEqual([])
    expect(fs.readFileSync(`${file}.last-good`, 'utf8')).toBe(ALLOW_ALL)
    fs.rmSync(file)
    const gone = loadPolicy()
    expect(gone.rules).toEqual([])
    expect(gone.error).toContain('is missing')
  })

  it('deleting the file keeps the version this process loaded, not a copy planted next to it', async () => {
    const { loadPolicy } = await fresh()
    const file = path.join(home, '.aimaestro', 'policy.json')
    fs.writeFileSync(file, DENY)
    expect(loadPolicy().rules).toHaveLength(1)
    // Before the fix this switched the rules off at once: the deleted-file path read only the saved copy
    fs.writeFileSync(`${file}.last-good`, ALLOW_ALL)
    fs.rmSync(file)
    const gone = loadPolicy()
    expect(gone.rules.map(r => r.id)).toEqual(['no-payroll'])
    expect(gone.lastGood).toBe('memory')
    // After a restart the saved copy is all there is (documented: the default place is agent-writable)
    const again = (await fresh()).loadPolicy()
    expect(again.lastGood).toBe('saved')
    expect(again.rules).toEqual([])
  })
})

describe('AIMAESTRO_POLICY_FILE', () => {
  it('is the file everywhere: read, reported, and never written to or beside', async () => {
    const rules = path.join(dir, 'protected')
    fs.mkdirSync(rules)
    const file = path.join(rules, 'rules.json')
    fs.writeFileSync(file, DENY)
    // The default file is ignored once a place is set
    fs.writeFileSync(path.join(home, '.aimaestro', 'policy.json'), ALLOW_ALL)
    vi.stubEnv('AIMAESTRO_POLICY_FILE', file)
    const { loadPolicy, policyFile, policySettings } = await fresh()
    expect(policyFile()).toBe(file)
    expect(policySettings()).toMatchObject({ file, configured: true, failClosed: false })
    const loaded = loadPolicy()
    expect(loaded).toMatchObject({ file, configured: true })
    expect(loaded.rules.map(r => r.id)).toEqual(['no-payroll'])
    expect(fs.readdirSync(rules)).toEqual(['rules.json'])
    expect(fs.readFileSync(file, 'utf8')).toBe(DENY)

    const { getPolicy } = await import('@/services/policy-service')
    const report = getPolicy().data as PolicyReport
    expect(report).toMatchObject({ file, configured: true, failClosed: false })
    // A temporary folder is writable by this user: the Doctor says the file protects nothing
    expect(report.writable).toEqual([file, rules])
    const doctor = checkPolicyRules(report)
    expect(doctor.items!.map(i => i.key)).toEqual([`policy:writable:${file}`, `policy:writable:${rules}`])
  })

  it('a copy planted beside a configured file is never used, before or after a restart', async () => {
    const file = path.join(dir, 'rules.json')
    vi.stubEnv('AIMAESTRO_POLICY_FILE', file)
    fs.writeFileSync(file, DENY)
    const { loadPolicy } = await fresh()
    expect(loadPolicy().rules).toHaveLength(1)
    fs.writeFileSync(`${file}.last-good`, ALLOW_ALL)
    touch(file, '{ "version": 2, "rules": [ ')
    // This process's version applies
    expect(loadPolicy()).toMatchObject({ lastGood: 'memory', rules: [{ id: 'no-payroll' }] })
    // A restart with a broken configured file: no last good version at all, the planted copy is ignored
    const after = (await fresh()).loadPolicy()
    expect(after.rules).toEqual([])
    expect(after.lastGood).toBeUndefined()
    expect(after.error).toContain('No rules apply until it is fixed')
  })

  it('a relative path is a broken setting, not a file read from wherever the server started', async () => {
    vi.stubEnv('AIMAESTRO_POLICY_FILE', 'policy.json')
    const { loadPolicy } = await fresh()
    expect(loadPolicy()).toMatchObject({ rules: [], error: expect.stringContaining('must be an absolute path') })
    vi.stubEnv('AIMAESTRO_POLICY_FAIL_CLOSED', '1')
    expect(loadPolicy()).toMatchObject({ failClosed: true })
  })
})

describe('AIMAESTRO_POLICY_FAIL_CLOSED', () => {
  const agent = (name: string) => ({ kind: 'agent' as const, id: `id-${name}`, name })

  it('off: a deleted file keeps the last good version; a broken one too', async () => {
    const file = path.join(home, '.aimaestro', 'policy.json')
    fs.writeFileSync(file, DENY)
    const { loadPolicy } = await fresh()
    loadPolicy()
    touch(file, 'not json')
    expect(loadPolicy()).toMatchObject({ rules: [{ id: 'no-payroll' }], lastGood: 'memory' })
    expect(loadPolicy().failClosed).toBeUndefined()
  })

  it('on: a missing, deleted or broken file refuses agents instead of applying a last good version', async () => {
    vi.stubEnv('AIMAESTRO_POLICY_FAIL_CLOSED', '1')
    const file = path.join(home, '.aimaestro', 'policy.json')
    const { loadPolicy } = await fresh()
    expect(loadPolicy()).toMatchObject({ rules: [], failClosed: true, error: expect.stringContaining('is missing') })
    fs.writeFileSync(file, DENY)
    expect(loadPolicy().failClosed).toBeUndefined()
    touch(file, '{ "version": 2, "rules": [ ')
    expect(loadPolicy()).toMatchObject({ rules: [], failClosed: true, error: expect.stringContaining('AIMAESTRO_POLICY_FAIL_CLOSED') })
    fs.rmSync(file)
    expect(loadPolicy()).toMatchObject({ failClosed: true })
    expect(fs.existsSync(`${file}.last-good`)).toBe(true) // kept, but not used while fail-closed is on
  })

  it('on: agents may not send, call or be changed; people and AI Maestro itself may still send', async () => {
    vi.stubEnv('AIMAESTRO_POLICY_FAIL_CLOSED', '1')
    vi.resetModules()
    const { checkPolicy } = await import('@/lib/policy-check')
    const bob = agent('bob'), alice = agent('alice')
    const refused = checkPolicy(bob, alice, 'message')
    expect(refused).toMatchObject({ allowed: false, effect: 'deny' })
    expect(refused.reason).toContain('AIMAESTRO_POLICY_FAIL_CLOSED')
    expect(checkPolicy(bob, { kind: 'person', id: 'carol' }, 'message').allowed).toBe(false)
    expect(checkPolicy(bob, alice, 'call').allowed).toBe(false)
    expect(checkPolicy({ kind: 'person' }, alice, 'message').allowed).toBe(true)
    expect(checkPolicy({ kind: 'person', id: 'carol' }, alice, 'call').allowed).toBe(true)
    expect(checkPolicy({ kind: 'system' }, alice, 'message').allowed).toBe(true)
    // Governance actions are made as a person (no login, spec 18.3): refused, AI Maestro's own repairs pass
    expect(checkPolicy({ kind: 'person' }, alice, 'agent.mode').allowed).toBe(false)
    expect(checkPolicy({ kind: 'person' }, alice, 'agent.delete').allowed).toBe(false)
    expect(checkPolicy({ kind: 'system' }, alice, 'agent.delete').allowed).toBe(true)
    // Fixed: the rules apply again
    fs.writeFileSync(path.join(home, '.aimaestro', 'policy.json'), DENY)
    expect(checkPolicy(bob, alice, 'message').allowed).toBe(true)
    expect(checkPolicy(bob, agent('payroll'), 'message').allowed).toBe(false)
  })

  it('on: GET /api/policy and the Doctor say it loudly', async () => {
    vi.stubEnv('AIMAESTRO_POLICY_FAIL_CLOSED', '1')
    vi.resetModules()
    const { getPolicy } = await import('@/services/policy-service')
    const report = getPolicy().data as PolicyReport
    expect(report).toMatchObject({ failClosed: true, refusing: true })
    const doctor = checkPolicyRules(report)
    expect(doctor.status).toBe('fail')
    expect(doctor.items![0]).toMatchObject({ key: 'policy:fail-closed', status: 'fail', message: expect.stringContaining('AGENTS ARE REFUSED') })
  })

  it('accepts 1, true, yes and on; anything else is off', async () => {
    const { policySettings } = await fresh()
    for (const v of ['1', 'true', 'YES', 'on']) expect(policySettings({ AIMAESTRO_POLICY_FAIL_CLOSED: v }, home).failClosed).toBe(true)
    for (const v of ['', '0', 'false', 'no']) expect(policySettings({ AIMAESTRO_POLICY_FAIL_CLOSED: v }, home).failClosed).toBe(false)
  })
})
