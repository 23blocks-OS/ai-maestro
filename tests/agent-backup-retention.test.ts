/**
 * B014 item 2: permanent-delete backups are pruned (5 newest kept, older than 30 days removed).
 * Runs against a temporary HOME; the real ~/.aimaestro is never touched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { pruneAgentBackups, parseBackupName } from '@/lib/agent-backup-retention'

const NOW = Date.parse('2026-10-08T12:00:00.000Z')
const DAY = 86_400_000
const ID = '08f8dc37-e151-47b0-bd72-5fdc7fc31087'
const nameAt = (daysAgo: number, id = ID) =>
  `${id}-${new Date(NOW - daysAgo * DAY).toISOString().replace(/[:.]/g, '-')}`

let home: string
let dir: string
const make = (name: string) => {
  fs.mkdirSync(path.join(dir, name), { recursive: true })
  fs.writeFileSync(path.join(dir, name, 'registry-entry.json'), '{}')
}
const left = () => fs.readdirSync(dir).sort()

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'b014-'))
  vi.stubEnv('HOME', home)
  expect(os.homedir()).toBe(home)
  dir = path.join(home, '.aimaestro', 'backups', 'agents')
  fs.mkdirSync(dir, { recursive: true })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  fs.rmSync(home, { recursive: true, force: true })
})

describe('parseBackupName', () => {
  it('round-trips the name backupAgentData creates and rejects others', () => {
    expect(parseBackupName(nameAt(3))).toBe(NOW - 3 * DAY)
    expect(parseBackupName('notes')).toBeNull()
    expect(parseBackupName(`${ID}-2026-13-45T99-00-00-000Z`)).toBeNull()
    expect(parseBackupName(`${ID}-yesterday`)).toBeNull()
  })
})

describe('pruneAgentBackups', () => {
  it('keeps the 5 newest even when old, removes older-than-30-days beyond them', () => {
    const ages = [40, 50, 60, 70, 80, 90, 100] // all old: 5 newest survive
    ages.forEach(a => make(nameAt(a)))
    const r = pruneAgentBackups({ now: NOW })
    expect(r.removed).toHaveLength(2)
    expect(left()).toEqual([nameAt(40), nameAt(50), nameAt(60), nameAt(70), nameAt(80)].sort())
  })

  it('keeps recent backups beyond the 5 newest', () => {
    for (let d = 1; d <= 8; d++) make(nameAt(d)) // 8 backups, all under 30 days
    make(nameAt(45))
    const r = pruneAgentBackups({ now: NOW })
    expect(r.removed).toEqual([nameAt(45)])
    expect(left()).toHaveLength(8)
  })

  it('ignores unknown names and plain files', () => {
    for (let d = 40; d < 48; d++) make(nameAt(d))
    make('keep-me')
    make('2020-01-01')
    fs.writeFileSync(path.join(dir, nameAt(200)), 'a file, not a backup')
    pruneAgentBackups({ now: NOW })
    const names = left()
    expect(names).toContain('keep-me')
    expect(names).toContain('2020-01-01')
    expect(names).toContain(nameAt(200))
    expect(names.filter(n => n.startsWith(ID))).toHaveLength(5 + 1)
  })

  it('honours AIM_BACKUP_KEEP and AIM_BACKUP_MAX_AGE_DAYS', () => {
    for (let d = 1; d <= 6; d++) make(nameAt(d))
    vi.stubEnv('AIM_BACKUP_KEEP', '2')
    vi.stubEnv('AIM_BACKUP_MAX_AGE_DAYS', '3')
    pruneAgentBackups({ now: NOW })
    expect(left()).toEqual([nameAt(1), nameAt(2), nameAt(3)].sort())
  })

  it('falls back to defaults on garbage env values', () => {
    for (let d = 40; d < 47; d++) make(nameAt(d))
    vi.stubEnv('AIM_BACKUP_KEEP', 'banana')
    vi.stubEnv('AIM_BACKUP_MAX_AGE_DAYS', '-4')
    pruneAgentBackups({ now: NOW })
    expect(left()).toHaveLength(5)
  })

  it("AIM_BACKUP_KEEP=all disables pruning", () => {
    for (let d = 40; d < 50; d++) make(nameAt(d))
    vi.stubEnv('AIM_BACKUP_KEEP', 'all')
    const r = pruneAgentBackups({ now: NOW })
    expect(r.disabled).toBe(true)
    expect(left()).toHaveLength(10)
  })

  it('dry run reports but deletes nothing', () => {
    for (let d = 40; d < 48; d++) make(nameAt(d))
    const r = pruneAgentBackups({ now: NOW, dryRun: true })
    expect(r.removed).toHaveLength(3)
    expect(left()).toHaveLength(8)
  })

  it('does not follow a symlink, even one named like a backup', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'b014-out-'))
    fs.writeFileSync(path.join(outside, 'precious'), 'x')
    for (let d = 40; d < 46; d++) make(nameAt(d))
    fs.symlinkSync(outside, path.join(dir, nameAt(300)))
    pruneAgentBackups({ now: NOW })
    expect(fs.existsSync(path.join(outside, 'precious'))).toBe(true)
    expect(fs.lstatSync(path.join(dir, nameAt(300))).isSymbolicLink()).toBe(true)
    fs.rmSync(outside, { recursive: true, force: true })
  })

  it('a failing rm does not throw and the run continues', () => {
    for (let d = 40; d < 50; d++) make(nameAt(d))
    const real = fs.rmSync
    vi.spyOn(fs, 'rmSync').mockImplementation(((p: fs.PathLike, o?: fs.RmOptions) => {
      if (String(p).endsWith(nameAt(48))) throw new Error('EBUSY')
      return real(p, o)
    }) as typeof fs.rmSync)
    let r!: ReturnType<typeof pruneAgentBackups>
    expect(() => { r = pruneAgentBackups({ now: NOW }) }).not.toThrow()
    expect(r.failed).toEqual([nameAt(48)])
    expect(r.removed).toHaveLength(4)
    expect(r.removed).toContain(nameAt(49))
    expect(left()).toContain(nameAt(48)) // the one that failed is still on disk
  })

  it('a missing backups directory is fine', () => {
    fs.rmSync(dir, { recursive: true })
    expect(() => pruneAgentBackups({ now: NOW })).not.toThrow()
  })
})
