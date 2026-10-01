/**
 * Tests for prune_skill_backups() in install-plugin.sh.
 *
 * THE BUG
 *
 * Every run of install-plugin.sh copies each existing skill to
 * `<skill>.backup-<timestamp>` before replacing it, and nothing ever deleted
 * them. install-plugin.sh runs on every install, every `update-aimaestro.sh`,
 * and every fleet deploy, so each pass left 8 more directories behind. Measured
 * on 2026-09-09: 313 on the laptop, 304 on mini-lola, 447 on mac-mini — 41
 * copies of `planning`, the oldest dating to 23 February.
 *
 * The cost is not disk (~6 MB). `~/.claude/skills` is a namespace Claude Code
 * ENUMERATES, so every stale copy was offered to agents as an invokable skill:
 * a session on 9 September was presented `agent-messaging.backup-20260909090251`
 * alongside the real one. Agents were choosing among forty-one versions of the
 * same skill, the oldest describing AMP as it behaved seven months earlier.
 *
 * The backups were near-useless anyway: the install already copies into a mktemp
 * dir and only removes the old skill once that copy has succeeded, so the
 * "restore from backup" branch is nearly unreachable — and the restore reads
 * only the newest backup, never the other forty.
 *
 * Pruning to two (v0.38) still left 16 duplicates of the 8 skills on every
 * machine (audit, 2026-10-01). Backups now live in ~/.aimaestro/backups/skills,
 * outside the namespace Claude Code enumerates, and old in-place backups are
 * moved there on the next install.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const SCRIPT = path.join(__dirname, '..', 'install-plugin.sh')

let home: string

/** Extract the function and run it against a fake backup directory. */
function prune(skill: string, keep?: number): string {
  const src = fs.readFileSync(SCRIPT, 'utf8')
  const fn = src.match(/^    prune_skill_backups\(\) \{[\s\S]*?^    \}/m)
  if (!fn) throw new Error('prune_skill_backups() not found in install-plugin.sh')

  const harness = path.join(home, 'h.sh')
  fs.writeFileSync(
    harness,
    'print_info() { echo "INFO: $*"; }\n' +
      `SKILL_BACKUP_DIR="${backupDir()}"\n` +
      fn[0].replace(/^ {4}/gm, '') + '\n' +
      `${keep !== undefined ? `SKILL_BACKUPS_KEEP=${keep}\n` : ''}` +
      `prune_skill_backups ${skill}\n`
  )
  return execFileSync('bash', [harness], {
    encoding: 'utf8', env: { ...process.env, HOME: home },
  })
}

const skillsDir = () => path.join(home, '.claude', 'skills')
const backupDir = () => path.join(home, '.aimaestro', 'backups', 'skills')
/** A live skill goes in ~/.claude/skills; a backup goes in the backup directory */
const mk = (name: string, dir = name.includes('.backup-') ? backupDir() : skillsDir()) => {
  fs.mkdirSync(path.join(dir, name), { recursive: true })
  fs.writeFileSync(path.join(dir, name, 'SKILL.md'), name)
}
const ls = () => [...fs.readdirSync(skillsDir()), ...fs.readdirSync(backupDir())].sort()

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-'))
  fs.mkdirSync(skillsDir(), { recursive: true })
  fs.mkdirSync(backupDir(), { recursive: true })
})
afterEach(() => fs.rmSync(home, { recursive: true, force: true }))

describe('pruning old skill backups', () => {
  it('keeps the two newest and deletes the rest', () => {
    mk('planning')
    for (const t of ['20260223225008', '20260501120000', '20260828181716', '20260909090251']) {
      mk(`planning.backup-${t}`)
    }
    prune('planning')
    expect(ls()).toEqual([
      'planning',
      'planning.backup-20260828181716',
      'planning.backup-20260909090251',
    ])
  })

  it('keeps the NEWEST, not whichever the filesystem lists first', () => {
    // Timestamps are %Y%m%d%H%M%S, so a lexical sort is chronological.
    mk('graph-query')
    for (const t of ['20260909090251', '20260223225008', '20260501120000']) {
      mk(`graph-query.backup-${t}`)
    }
    prune('graph-query', 1)
    expect(ls()).toEqual(['graph-query', 'graph-query.backup-20260909090251'])
  })

  it('never touches the live skill', () => {
    mk('memory-search')
    mk('memory-search.backup-20260101000000')
    mk('memory-search.backup-20260102000000')
    mk('memory-search.backup-20260103000000')
    prune('memory-search')
    expect(fs.existsSync(path.join(skillsDir(), 'memory-search', 'SKILL.md'))).toBe(true)
  })

  it('never touches a DIFFERENT skill', () => {
    // The glob is per-skill; pruning one must not reach across to another.
    mk('planning'); mk('planning.backup-20260101000000'); mk('planning.backup-20260102000000')
    mk('planning.backup-20260103000000')
    mk('docs-search'); mk('docs-search.backup-20260101000000')
    prune('planning')
    expect(ls()).toContain('docs-search.backup-20260101000000')
  })

  it('does nothing when there are fewer backups than the keep count', () => {
    mk('canvas-actions')
    mk('canvas-actions.backup-20260101000000')
    prune('canvas-actions')
    expect(ls()).toEqual(['canvas-actions', 'canvas-actions.backup-20260101000000'])
  })

  it('does nothing, and does not error, when there are no backups at all', () => {
    mk('agent-identity')
    expect(() => prune('agent-identity')).not.toThrow()
    expect(ls()).toEqual(['agent-identity'])
  })

  it('handles the real-world pileup — 41 backups down to 2', () => {
    mk('agent-messaging')
    for (let i = 0; i < 41; i++) {
      mk(`agent-messaging.backup-2026${String(i + 10).padStart(10, '0')}`)
    }
    const out = prune('agent-messaging')
    expect(ls().filter(n => n.includes('.backup-'))).toHaveLength(2)
    expect(out).toContain('Pruned 39')
  })
})

describe('backups live outside ~/.claude/skills', () => {
  /** Run the block that moves old in-place backups out of the skills directory */
  function migrate(): string {
    const src = fs.readFileSync(SCRIPT, 'utf8')
    const block = src.match(/^    SKILL_BACKUP_DIR=[\s\S]*?print_info "Moved[^\n]*\n/m)
    if (!block) throw new Error('backup migration block not found in install-plugin.sh')
    const harness = path.join(home, 'm.sh')
    fs.writeFileSync(harness, 'print_info() { echo "INFO: $*"; }\n' + block[0].replace(/^ {4}/gm, ''))
    return execFileSync('bash', [harness], { encoding: 'utf8', env: { ...process.env, HOME: home } })
  }

  it('moves old in-place backups out, leaving only live skills where Claude Code looks', () => {
    mk('planning')
    mk('planning.backup-20260919125300', skillsDir())
    mk('planning.backup-20260920122442', skillsDir())
    const out = migrate()
    expect(fs.readdirSync(skillsDir())).toEqual(['planning'])
    expect(fs.readdirSync(backupDir()).sort()).toEqual(['planning.backup-20260919125300', 'planning.backup-20260920122442'])
    expect(out).toContain('Moved 2')
  })

  it('never writes a backup or a staging copy into ~/.claude/skills', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8')
    expect(src).not.toMatch(/~\/\.claude\/skills\/[^\s"]*\.backup-"?\$\(date/)
    expect(src).not.toMatch(/mktemp -d ~\/\.claude\/skills/)
  })
})

describe('the script wires it up', () => {
  const src = () => fs.readFileSync(SCRIPT, 'utf8')

  it('prunes after installing agent-messaging', () => {
    expect(src()).toContain('prune_skill_backups agent-messaging')
  })

  it('prunes after installing every other skill', () => {
    expect(src()).toContain('prune_skill_backups "$skill"')
  })

  it('prunes only AFTER a successful install, never before', () => {
    // Pruning ahead of the install could delete the rollback we still need.
    const s = src()
    const install = s.indexOf('mv "$TEMP_SKILL_DIR" ~/.claude/skills/"$skill"')
    const prunePos = s.indexOf('prune_skill_backups "$skill"')
    expect(install).toBeGreaterThan(-1)
    expect(prunePos).toBeGreaterThan(install)
  })
})
