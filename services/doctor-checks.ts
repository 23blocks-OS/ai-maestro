/**
 * Doctor checks (F069, docs/SPEC-DOCTOR.md section 4): one item per agent, folder or file a check is
 * about. Every check is read-only. Each takes its inputs (agents, home folder, tmux names) so tests
 * build them without a real home or tmux.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { Agent } from '@/types/agent'
import { parseSessionName, ORPHAN_TASK_DESCRIPTION } from '@/types/agent'
import { isSelf } from '@/lib/hosts-config'
import { folderOwner } from '@/lib/agent-registry'
import { loadTeams } from '@/lib/team-registry'
import { listSchedulesByAgent } from '@/lib/schedule-registry'
import { defaultSchedule } from '@/lib/agent-schedule'
import { parseBackupName } from '@/lib/agent-backup-retention'
import { runtimeOf, runningOutsideTmux } from '@/lib/agent-runtime-kind.mjs'
import { resolveJsonlPathForDir } from '@/lib/chat-transcript.mjs'
import { tmux } from '@/lib/tmux-safe.mjs'

const execFileAsync = promisify(execFile)

export type DiagnosticStatus = 'pass' | 'fail' | 'warn'
export type DiagnosticCategory = 'host' | 'install' | 'agents' | 'peers'
export type DiagnosticFixId = 'delete-ghost-agent' | 'remove-deleted-agent-backups'

export interface DiagnosticFix {
  id: DiagnosticFixId
  label: string
  destructive: boolean
  confirm: string
}

export interface DiagnosticItem {
  key: string
  status: DiagnosticStatus
  message: string
  agentId?: string
  agentName?: string
  path?: string
  fix?: DiagnosticFix
}

export interface DiagnosticCheck {
  name: string
  status: DiagnosticStatus
  message: string
  category?: DiagnosticCategory
  hint?: string
  items?: DiagnosticItem[]
  details?: Record<string, unknown>
}

export const GHOST_AGE_MS = 24 * 60 * 60 * 1000
export const BACKUPS_WARN_BYTES = 1024 ** 3
/** The events install-hooks.sh always installs; PermissionRequest depends on the Claude Code version */
export const HOOK_EVENTS = ['Notification', 'Stop', 'UserPromptSubmit', 'SessionStart', 'PostToolBatch', 'StopFailure', 'SessionEnd']

const RANK: Record<DiagnosticStatus, number> = { pass: 0, warn: 1, fail: 2 }
export const worst = (items: { status: DiagnosticStatus }[]): DiagnosticStatus =>
  items.reduce<DiagnosticStatus>((w, i) => (RANK[i.status] > RANK[w] ? i.status : w), 'pass')

/** Not deleted and on this host */
const isLocal = (a: Agent) => !a.deletedAt && (a.hostId == null || isSelf(a.hostId))
/** Lives in a folder on this host: not a container, not in the cloud */
const hasHostFolder = (a: Agent) => isLocal(a) && a.runtime !== 'docker' && a.deployment?.type !== 'cloud'
const folderOf = (a: Agent) => a.workingDirectory || a.sessions?.[0]?.workingDirectory
/** The match listAgents uses: the session name without its index suffix, case-insensitive */
const hasTmuxSession = (a: Agent, tmuxNames: string[]) =>
  tmuxNames.some(n => parseSessionName(n).agentName.toLowerCase() === a.name.toLowerCase())

function check(name: string, category: DiagnosticCategory, items: DiagnosticItem[], ok: string, bad: string, hint?: string): DiagnosticCheck {
  const status = worst(items)
  return {
    name,
    category,
    status,
    message: status === 'pass' ? ok : bad,
    ...(status !== 'pass' && hint ? { hint } : {}),
    ...(items.length ? { items } : {}),
  }
}

// ---------------------------------------------------------------------------
// 4.1 agent-folders
// ---------------------------------------------------------------------------

export function checkAgentFolders(agents: Agent[]): DiagnosticCheck {
  const items: DiagnosticItem[] = agents
    .filter(a => hasHostFolder(a) && a.workingDirectory && !fs.existsSync(a.workingDirectory))
    .map(a => ({ key: a.id, status: 'warn', agentId: a.id, agentName: a.name, path: a.workingDirectory, message: `Folder ${a.workingDirectory} does not exist` }))
  return check('agent-folders', 'agents', items, 'Every agent folder exists', `${items.length} agent(s) point to a folder that does not exist`,
    "Set the folder in the agent's profile, or recreate the folder.")
}

// ---------------------------------------------------------------------------
// 4.3 name-hints
// ---------------------------------------------------------------------------

/** The name hint AMP scripts find from a folder: amp-helper.sh walks up to, not including, "/" */
export function findNameHint(dir: string): { name: string; file: string } | null {
  for (let d = path.resolve(dir); d !== path.dirname(d); d = path.dirname(d)) {
    const file = path.join(d, '.claude', 'settings.local.json')
    try {
      const env = JSON.parse(fs.readFileSync(file, 'utf8'))?.env
      const name = env?.CLAUDE_AGENT_NAME || env?.AIM_AGENT_NAME
      if (typeof name === 'string' && name) return { name, file }
    } catch { /* no file or not JSON: amp-helper's jq skips it too */ }
  }
  return null
}

export function checkNameHints(agents: Agent[]): DiagnosticCheck {
  const live = new Set(agents.filter(a => !a.deletedAt).map(a => a.name.toLowerCase()))
  const items: DiagnosticItem[] = []
  for (const a of agents) {
    const dir = folderOf(a)
    if (!hasHostFolder(a) || !dir) continue
    const hint = findNameHint(dir)
    if (!hint || hint.name.toLowerCase() === a.name.toLowerCase()) continue
    const inherited = path.dirname(path.dirname(hint.file)) !== path.resolve(dir)
    const what = !live.has(hint.name.toLowerCase())
      ? `names "${hint.name}", which is not an agent`
      : `names "${hint.name}"`
    items.push({
      key: a.id, status: 'warn', agentId: a.id, agentName: a.name, path: hint.file,
      message: `${inherited ? 'Inherits a name hint from' : 'Its name hint'} ${hint.file} ${what}: AMP commands run in this folder outside AI Maestro act as that agent`,
    })
  }
  return check('name-hints', 'agents', items, 'Name hints match their agents', `${items.length} agent(s) have a name hint for another agent`,
    "Run `amp-init.sh --name <agent> --remember` in the agent's folder.")
}

// ---------------------------------------------------------------------------
// 4.4 amp-mailboxes
// ---------------------------------------------------------------------------

const ampAddressOf = (a: Agent): string | undefined => a.metadata?.amp?.address || a.ampIdentity?.ampAddress

export function checkAmpMailboxes(agents: Agent[], home: string): DiagnosticCheck {
  const items: DiagnosticItem[] = []
  for (const a of agents) {
    const address = ampAddressOf(a)
    if (!isLocal(a) || !(a.ampRegistered || a.metadata?.amp)) continue
    const dir = path.join(home, '.agent-messaging', 'agents', a.id)
    if (!fs.existsSync(dir)) items.push({ key: `${a.id}:dir`, status: 'warn', agentId: a.id, agentName: a.name, path: dir, message: `AMP mailbox ${dir} is missing` })
    const local = address?.split('@')[0]
    if (local && local.toLowerCase() !== a.name.toLowerCase()) {
      items.push({ key: `${a.id}:address`, status: 'warn', agentId: a.id, agentName: a.name, message: `AMP address ${address} does not match the name ${a.name}` })
    }
  }
  return check('amp-mailboxes', 'agents', items, 'Every AMP agent has its mailbox and address', `${items.length} AMP mailbox problem(s)`,
    'Open the agent and re-register AMP, or rename it to match its address.')
}

// ---------------------------------------------------------------------------
// 4.5 ghost-agents
// ---------------------------------------------------------------------------

/**
 * Live tmux session names, asked of tmux itself (no cache). [] when no server runs; null when tmux
 * failed in another way, so that a failed call never reads as "no sessions" and condemns agents.
 */
export async function liveTmuxNames(): Promise<string[] | null> {
  try {
    const { stdout } = await tmux(['list-sessions', '-F', '#{session_name}'], { timeout: 5000 })
    return stdout.split('\n').map((s: string) => s.trim()).filter(Boolean)
  } catch (err: any) {
    const text = `${err?.stderr || ''} ${err?.message || ''}`
    return /no server running|no sessions|error connecting to|No such file or directory/i.test(text) && !err?.killed ? [] : null
  }
}

export interface GhostInputs {
  home: string
  agents: Agent[]
  tmuxNames: string[]
  now: number
}

function nonEmptyDir(dir: string): boolean {
  try { return fs.readdirSync(dir).some(f => !f.startsWith('.')) } catch { return false }
}

function hasOwnSchedules(a: Agent, home: string): boolean {
  if (listSchedulesByAgent(a.id).length > 0) return true
  const builtIn = new Set(defaultSchedule(a.id).tasks.map(t => t.id))
  try {
    const s = JSON.parse(fs.readFileSync(path.join(home, '.aimaestro', 'agents', a.id, 'schedule.json'), 'utf8'))
    return Array.isArray(s?.tasks) && s.tasks.some((t: { id?: string }) => !builtIn.has(t?.id as string))
  } catch {
    return false
  }
}

function hasCanvasPages(a: Agent, home: string): boolean {
  try {
    return fs.readdirSync(path.join(home, '.aimaestro', 'agents', a.id, 'canvas'), { recursive: true })
      .some(f => String(f).endsWith('.html'))
  } catch {
    return false
  }
}

/** The newest sign of life: registration, the agent's own lastActive, any session's lastActive */
export function lastSignOfLife(a: Agent): number {
  const times = [a.metadata?.autoRegisteredAt, a.lastActive, ...(a.sessions || []).map(s => s.lastActive)]
    .map(t => Date.parse(t as string)).filter(Number.isFinite)
  return times.length ? Math.max(...times) : NaN
}

/**
 * Why this agent is not a ghost: the conditions of spec 4.5 that fail. [] means it is a ghost. Cheap
 * conditions come first; the loop stops at the first that fails, so real agents cost one or two tests.
 */
export function ghostSavers(a: Agent, x: GhostInputs): string[] {
  const conditions: [string, () => boolean][] = [
    ['not auto-registered', () => a.metadata?.autoRegistered !== true],
    ['not a local tmux agent', () => !hasHostFolder(a)],
    ['had a Claude session', () => !!a.claudeSessionId],
    ['was named or described', () => a.taskDescription !== ORPHAN_TASK_DESCRIPTION || !!a.label || !!a.avatar],
    ['is active recently', () => { const t = lastSignOfLife(a); return !Number.isFinite(t) || x.now - t <= GHOST_AGE_MS }],
    ['has a tmux session', () => hasTmuxSession(a, x.tmuxNames)],
    ['is running', () => runtimeOf(a) !== null],
    ['is in a team', () => loadTeams().some(t => t.agentIds?.includes(a.id))],
    ['has messages', () => ['inbox', 'sent'].some(f => nonEmptyDir(path.join(x.home, '.agent-messaging', 'agents', a.id, 'messages', f)))],
    ['has schedules', () => hasOwnSchedules(a, x.home)],
    ['has canvas pages', () => hasCanvasPages(a, x.home)],
    ['has transcripts in its own folder', () => {
      const dir = folderOf(a)
      return !!dir && !folderOwner(dir, a.id, x.agents) && !!resolveJsonlPathForDir(dir)
    }],
  ]
  for (const [why, fails] of conditions) if (fails()) return [why]
  return []
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10)

export function checkGhostAgents(agents: Agent[], home: string, tmuxNames: string[] | null, now = Date.now()): DiagnosticCheck {
  if (tmuxNames === null) {
    return { name: 'ghost-agents', category: 'agents', status: 'warn', message: 'Could not list tmux sessions, so ghost agents were not checked' }
  }
  const x: GhostInputs = { home, agents, tmuxNames, now }
  const items: DiagnosticItem[] = agents.filter(a => ghostSavers(a, x).length === 0).map(a => {
    const idleDays = Math.floor((now - lastSignOfLife(a)) / 86_400_000)
    return {
      key: a.id, status: 'warn', agentId: a.id, agentName: a.name,
      message: `Registered ${a.metadata?.autoRegisteredAt ? day(Date.parse(a.metadata.autoRegisteredAt)) : '(unknown date)'} from tmux session ${a.name}; never started, no messages, no session for ${idleDays} day(s)`,
      fix: {
        id: 'delete-ghost-agent', label: 'Delete agent', destructive: true,
        confirm: `Delete ${a.name}? It is removed from the registry with its mailbox and agent folder; a backup is kept in ~/.aimaestro/backups/agents/. Its working folder is not touched.`,
      },
    }
  })
  return check('ghost-agents', 'agents', items, 'No ghost agents', `${items.length} ghost agent(s): registered from a tmux session and never used`,
    'Delete them, or name and use them to keep them.')
}

// ---------------------------------------------------------------------------
// 4.6 outside-agents
// ---------------------------------------------------------------------------

/** A recent hook state alone is not "outside": an agent in tmux has one too, so a live tmux session rules it out */
export function checkOutsideAgents(agents: Agent[], tmuxNames: string[] | null): DiagnosticCheck {
  if (tmuxNames === null) {
    return { name: 'outside-agents', category: 'agents', status: 'pass', message: 'Could not list tmux sessions, so agents running outside AI Maestro were not checked' }
  }
  const items: DiagnosticItem[] = agents.filter(a => isLocal(a) && !hasTmuxSession(a, tmuxNames) && runningOutsideTmux(a)).map(a => ({
    key: a.id, status: 'pass', agentId: a.id, agentName: a.name,
    message: 'Runs in its own terminal; AI Maestro will not wake it',
  }))
  return {
    name: 'outside-agents', category: 'agents', status: 'pass',
    message: items.length ? `${items.length} agent(s) run outside AI Maestro` : 'No agent runs outside AI Maestro',
    ...(items.length ? { items } : {}),
  }
}

// ---------------------------------------------------------------------------
// 4.7 deleted-agent-backups
// ---------------------------------------------------------------------------

export interface DeletedBackup { name: string; dir: string; agentId: string; at: number }

/** Backups (real directories with our name) whose agent is gone from the registry or deleted */
export function listDeletedAgentBackups(agents: Agent[], backupsDir: string): DeletedBackup[] {
  const live = new Set(agents.filter(a => !a.deletedAt).map(a => a.id))
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(backupsDir, { withFileTypes: true }) } catch { return [] }
  const out: DeletedBackup[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue // Dirent of a symlink is not a directory: never followed
    const at = parseBackupName(e.name)
    if (at === null) continue
    const agentId = e.name.slice(0, e.name.length - '-2026-01-01T00-00-00-000Z'.length)
    if (!live.has(agentId)) out.push({ name: e.name, dir: path.join(backupsDir, e.name), agentId, at })
  }
  return out.sort((a, b) => a.at - b.at)
}

/** Size in bytes through du (argv, no shell); null when du fails or takes over 5 s */
export async function dirBytes(dir: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('du', ['-sk', dir], { timeout: 5000 })
    const kb = parseInt(stdout.trim().split(/\s+/)[0], 10)
    return Number.isFinite(kb) ? kb * 1024 : null
  } catch {
    return null
  }
}

export const formatBytes = (n: number | null) =>
  n === null ? 'size unknown' : n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`

function backupAgentName(dir: string): string | null {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'registry-entry.json'), 'utf8'))?.name || null } catch { return null }
}

export async function checkDeletedAgentBackups(agents: Agent[], backupsDir: string): Promise<DiagnosticCheck> {
  const backups = listDeletedAgentBackups(agents, backupsDir)
  if (!backups.length) return { name: 'deleted-agent-backups', category: 'install', status: 'pass', message: 'No backups of deleted agents' }
  const sizes = await Promise.all(backups.map(b => dirBytes(b.dir)))
  const total = sizes.reduce<number>((t, s) => t + (s ?? 0), 0)
  const status: DiagnosticStatus = total >= BACKUPS_WARN_BYTES ? 'warn' : 'pass'
  const items: DiagnosticItem[] = backups.map((b, i) => ({
    key: b.name, status: 'pass', agentId: b.agentId, path: b.dir,
    agentName: backupAgentName(b.dir) || undefined,
    message: `${backupAgentName(b.dir) || b.agentId}, deleted ${day(b.at)}, ${formatBytes(sizes[i])}`,
  }))
  items.unshift({
    key: '*', status, message: `${backups.length} backup(s), ${formatBytes(total)} in all`,
    fix: {
      id: 'remove-deleted-agent-backups', label: 'Remove all', destructive: true,
      confirm: `Remove ${backups.length} backup(s) of deleted agents (${formatBytes(total)})? They cannot be restored afterwards. Backups of agents that exist are kept.`,
    },
  })
  return {
    name: 'deleted-agent-backups', category: 'install', status,
    message: `${backups.length} backup(s) of deleted agents, ${formatBytes(total)}`,
    ...(status === 'warn' ? { hint: 'Remove them when you no longer need to restore those agents. Retention removes them after 30 days.' } : {}),
    items,
  }
}

// ---------------------------------------------------------------------------
// 4.8 app-version
// ---------------------------------------------------------------------------

export function readAppVersion(repoDir: string): string {
  try { return JSON.parse(fs.readFileSync(path.join(repoDir, 'version.json'), 'utf8')).version || 'unknown' } catch { return 'unknown' }
}

export function checkAppVersion(version: string): DiagnosticCheck {
  return { name: 'app-version', category: 'install', status: version === 'unknown' ? 'warn' : 'pass', message: `AI Maestro ${version}` }
}

// ---------------------------------------------------------------------------
// 4.9 claude-hook
// ---------------------------------------------------------------------------

const sha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

export function checkClaudeHook(home: string, repoDir: string): DiagnosticCheck {
  const hint = 'Run `./update-aimaestro.sh -y`, or `scripts/claude-hooks/install-hooks.sh`.'
  const ours = path.join(repoDir, 'scripts', 'claude-hooks', 'ai-maestro-hook.cjs')
  let hooks: Record<string, { hooks?: { command?: string }[] }[]> = {}
  try {
    hooks = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'))?.hooks || {}
  } catch { /* no settings: no hook */ }

  const byEvent = new Map<string, string[]>()
  for (const [event, groups] of Object.entries(hooks)) {
    const cmds = (Array.isArray(groups) ? groups : []).flatMap(g => g?.hooks || []).map(h => h?.command || '').filter(c => c.includes('ai-maestro-hook'))
    if (cmds.length) byEvent.set(event, cmds)
  }
  if (!byEvent.size) {
    return { name: 'claude-hook', category: 'install', status: 'fail', message: 'The AI Maestro hook is not installed in ~/.claude/settings.json', hint }
  }

  const items: DiagnosticItem[] = HOOK_EVENTS.filter(e => !byEvent.has(e))
    .map(e => ({ key: `event:${e}`, status: 'warn', message: `No hook for ${e}` }))
  const files = new Set([...byEvent.values()].flat().map(c => c.match(/(\S*ai-maestro-hook\.cjs)/)?.[1]).filter(Boolean) as string[])
  for (const file of files) {
    if (!fs.existsSync(file)) items.push({ key: `file:${file}`, status: 'fail', path: file, message: `The hook points to ${file}, which does not exist` })
    else if (path.resolve(file) !== ours && fs.existsSync(ours) && sha256(file) !== sha256(ours)) {
      items.push({ key: `file:${file}`, status: 'warn', path: file, message: `The hook runs ${file}, which differs from this install's ${ours}` })
    }
  }
  return check('claude-hook', 'install', items, 'The AI Maestro hook is installed and current', `${items.length} hook problem(s)`, hint)
}

// ---------------------------------------------------------------------------
// 4.10 amp-scripts
// ---------------------------------------------------------------------------

export function checkAmpScripts(home: string, repoDir: string): DiagnosticCheck {
  const src = path.join(repoDir, 'plugin', 'plugins', 'ai-maestro', 'scripts')
  let scripts: string[]
  try { scripts = fs.readdirSync(src).filter(f => /^amp-.*\.sh$/.test(f)) } catch { scripts = [] }
  if (!scripts.length) return { name: 'amp-scripts', category: 'install', status: 'warn', message: `No AMP scripts found in ${src}` }
  const items: DiagnosticItem[] = []
  for (const f of scripts) {
    const installed = path.join(home, '.local', 'bin', f)
    if (!fs.existsSync(installed)) items.push({ key: f, status: 'warn', path: installed, message: `${f} is not installed in ~/.local/bin` })
    else if (sha256(installed) !== sha256(path.join(src, f))) items.push({ key: f, status: 'warn', path: installed, message: `${f} in ~/.local/bin differs from this install's copy` })
  }
  return check('amp-scripts', 'install', items, `${scripts.length} AMP scripts match this install`, `${items.length} AMP script(s) missing or out of date`,
    'Run `./update-aimaestro.sh -y`.')
}
