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
import { matchProgramName } from '@/lib/program-names'
import { ampRefusalsFile, readAmpRefusals } from '@/lib/amp-refusals'
import { allOnPath, realDeps, type ReadinessDeps } from '@/services/tool-readiness-service'
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

/** The version this server process runs (server.mjs records it at start), else what is on disk. */
export function runningAppVersion(repoDir: string): string {
  return process.env.AIM_RUNNING_VERSION || readAppVersion(repoDir)
}

/** `onDisk` differs from `running` after a deploy changed the files but before the restart. */
export function checkAppVersion(running: string, onDisk: string = running): DiagnosticCheck {
  if (running === 'unknown') return { name: 'app-version', category: 'install', status: 'warn', message: 'AI Maestro version unknown' }
  if (onDisk !== running && onDisk !== 'unknown') {
    return {
      name: 'app-version', category: 'install', status: 'warn',
      message: `AI Maestro ${running} is running; the files on disk are ${onDisk}`,
      hint: 'Restart AI Maestro (pm2 restart ai-maestro) to run the new version.',
    }
  }
  return { name: 'app-version', category: 'install', status: 'pass', message: `AI Maestro ${running}` }
}

// ---------------------------------------------------------------------------
// 4.9 claude-hook
// ---------------------------------------------------------------------------

const sha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

/** Our hook's commands per event in one Claude Code settings file (empty when the file or the hook is missing) */
function ourHookCommands(settingsFile: string): Map<string, string[]> {
  let hooks: Record<string, { hooks?: { command?: string }[] }[]> = {}
  try {
    hooks = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))?.hooks || {}
  } catch { /* no settings: no hook */ }
  const byEvent = new Map<string, string[]>()
  for (const [event, groups] of Object.entries(hooks)) {
    const cmds = (Array.isArray(groups) ? groups : []).flatMap(g => g?.hooks || []).map(h => h?.command || '').filter(c => c.includes('ai-maestro-hook'))
    if (cmds.length) byEvent.set(event, cmds)
  }
  return byEvent
}

export function checkClaudeHook(home: string, repoDir: string, agents: Agent[] = []): DiagnosticCheck {
  const hint = 'Run `./update-aimaestro.sh -y`, or `scripts/claude-hooks/install-hooks.sh`.'
  const ours = path.join(repoDir, 'scripts', 'claude-hooks', 'ai-maestro-hook.cjs')
  const byEvent = ourHookCommands(path.join(home, '.claude', 'settings.json'))
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
  // An agent with its own Claude folder reads that folder's settings, not ~/.claude (aim-launch.sh adds the hook at start)
  for (const a of agents) {
    const dir = a.credential?.kind === 'config-dir' ? a.credential.dir : undefined
    if (!dir || !isLocal(a)) continue
    if (!ourHookCommands(path.join(dir, 'settings.json')).size) {
      items.push({ key: `agent:${a.name}`, status: 'warn', path: dir, message: `${a.name} uses its own Claude folder ${dir}, which has no AI Maestro hook yet; it is added when the agent next starts` })
    }
    if (!fs.existsSync(path.join(dir, 'skills', 'agent-messaging', 'SKILL.md'))) {
      items.push({ key: `agent:${a.name}:skills`, status: 'warn', path: dir, message: `${a.name} uses its own Claude folder ${dir}, which has no AI Maestro skills yet; they are copied when the agent next starts` })
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

// ---------------------------------------------------------------------------
// agent-programs (F071): the programs this host's agents run, found the way their tmux shell finds them
// ---------------------------------------------------------------------------

/** First Claude Code version with the PermissionRequest hook (install-hooks.sh registers it from there) */
const PERMISSION_REQUEST_MIN = '2.0.45'
const PROGRAM_NAME = /^[a-z][a-z0-9-]{0,30}$/

export interface ProgramProbe {
  /** Every copy of `cmd` on the agents' shell PATH, the one that runs first; null when the shell could not be asked */
  copies: (cmd: string) => Promise<string[] | null>
  /** `<bin> --version`: its first line, or hung when it did not answer in time */
  version: (bin: string) => Promise<{ text: string | null; hung: boolean }>
}

const semver = (t: string | null) => t?.match(/\d+\.\d+\.\d+/)?.[0] || null
const newer = (a: string, b: string) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

/**
 * The real probe, on the same login-shell PATH and runner as tool readiness (F040): agents launch a bare
 * `claude`, `codex`, … in a tmux shell, so the copy that runs is the first on that PATH, which can differ from
 * this server's PATH. On mac-mini an old Homebrew claude in /usr/local/bin came first there and hung on
 * --version (2026-11-03).
 */
export function systemProgramProbe(deps: ReadinessDeps = realDeps): ProgramProbe {
  return {
    async copies(cmd) {
      try { return allOnPath(cmd, await deps.agentPath(), deps.isExecutable) } catch { return null }
    },
    async version(bin) {
      const r = await deps.run(bin, ['--version'], { ...process.env, PATH: await deps.agentPath() })
      return { text: r.ok ? r.output.split('\n')[0].trim() || null : null, hung: !!r.timedOut }
    },
  }
}

export async function checkAgentPrograms(agents: Agent[], home: string, probe: ProgramProbe = systemProgramProbe()): Promise<DiagnosticCheck> {
  const hint = 'Install or update the program for the user that runs AI Maestro, or remove the old copy the item names.'
  // Which commands this host's agents launch, and by whom; Claude Code always
  const users = new Map<string, string[]>([['claude', []]])
  for (const a of agents.filter(isLocal)) {
    const m = matchProgramName(a.program || '')
    if (!m || !PROGRAM_NAME.test(m.command)) continue
    users.set(m.command, [...(users.get(m.command) || []), a.label || a.name])
  }

  const items: DiagnosticItem[] = []
  const programs: { name: string; path: string; version: string | null }[] = []
  await Promise.all([...users].map(async ([cmd, names]) => {
    const copies = await probe.copies(cmd)
    if (copies === null) {
      items.push({ key: `program:${cmd}`, status: 'warn', message: `Could not ask the login shell where ${cmd} is` })
      return
    }
    const who = names.length ? ` (used by ${names.slice(0, 5).join(', ')}${names.length > 5 ? ` and ${names.length - 5} more` : ''})` : ''
    if (copies.length === 0) {
      if (names.length) items.push({ key: `program:${cmd}`, status: 'fail', message: `${cmd} is not installed${who}` })
      return
    }
    const first = await probe.version(copies[0])
    programs.push({ name: cmd, path: copies[0], version: semver(first.text) || first.text })
    if (first.hung) {
      items.push({ key: `program:${cmd}`, status: 'fail', path: copies[0], message: `${copies[0]} --version did not answer in 8 s${who}` })
      return
    }
    // An older copy that runs first: scripts and new agents get it, not the one you updated
    const v1 = semver(first.text)
    if (copies.length > 1 && v1) {
      const later = await Promise.all(copies.slice(1).map(async p => ({ p, v: semver((await probe.version(p)).text) })))
      const newest = later.filter(l => l.v && newer(l.v, v1)).sort((x, y) => (newer(x.v!, y.v!) ? -1 : 1))[0]
      if (newest) items.push({ key: `program:${cmd}:order`, status: 'warn', path: copies[0], message: `${copies[0]} (${v1}) runs before ${newest.p} (${newest.v})` })
    }
    if (cmd === 'claude' && v1 && !newer(PERMISSION_REQUEST_MIN, v1) && !hasPermissionRequestHook(home)) {
      items.push({ key: 'program:claude:permission-hook', status: 'warn', message: `Claude Code ${v1} supports the PermissionRequest hook, but it is not registered (run scripts/claude-hooks/install-hooks.sh)` })
    }
  }))
  items.sort((a, b) => a.key.localeCompare(b.key))
  programs.sort((a, b) => a.name.localeCompare(b.name))
  const ok = programs.map(p => `${p.name} ${p.version || '?'}`).join(', ') || 'No agent programs to check'
  return { ...check('agent-programs', 'install', items, ok, `${items.length} agent program problem(s)`, hint), details: { programs } }
}

function hasPermissionRequestHook(home: string): boolean {
  try {
    const groups = JSON.parse(fs.readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'))?.hooks?.PermissionRequest
    return Array.isArray(groups) && groups.some((g: any) => (g?.hooks || []).some((h: any) => String(h?.command || '').includes('ai-maestro-hook')))
  } catch { return false }
}

// ---------------------------------------------------------------------------
// amp-refusals (B006): messages this host refused in the last day, grouped by reason and sender
// ---------------------------------------------------------------------------

export function checkAmpRefusals(now = Date.now(), file = ampRefusalsFile()): DiagnosticCheck {
  const hint = 'Usually the sender\'s host runs stale AMP scripts or the sender rotated its key: update that host (./update-aimaestro.sh -y). Every refusal is in ~/.aimaestro/logs/amp-refusals.jsonl.'
  const recent = readAmpRefusals(now - 24 * 60 * 60 * 1000, file)
  const groups = new Map<string, { reason: string; from: string; via?: string; n: number; last: string }>()
  for (const r of recent) {
    const from = r.from || 'an unknown sender'
    const k = `${r.reason}|${from}`
    const g = groups.get(k) || { reason: r.reason, from, via: r.via, n: 0, last: r.at }
    g.n++; g.last = r.at; g.via = r.via || g.via
    groups.set(k, g)
  }
  const items: DiagnosticItem[] = [...groups.values()].sort((a, b) => b.n - a.n).slice(0, 10).map(g => ({
    key: `refusal:${g.reason}:${g.from}`,
    status: 'warn' as const,
    message: `${g.n} message(s) from ${g.from} refused: ${g.reason}${g.via ? ` (via ${g.via})` : ''}; last at ${g.last.slice(0, 16).replace('T', ' ')} UTC`,
  }))
  return check('amp-refusals', 'host', items, 'No AMP messages refused in the last 24 hours', `${recent.length} AMP message(s) refused in the last 24 hours`, hint)
}

// ---------------------------------------------------------------------------
// cross-origin (B044): browser requests the origin guard refused, or would have refused in audit mode
// ---------------------------------------------------------------------------

export interface OriginGuardStats {
  mode: string
  total: number
  entries: { reason: string; path: string; method: string; origin: string | null; host: string; count: number; last: number }[]
}

export function checkCrossOrigin(stats: OriginGuardStats | null = (globalThis as any)._originGuard?.stats() ?? null): DiagnosticCheck {
  if (!stats) return { name: 'cross-origin', status: 'pass', category: 'host', message: 'The origin guard is not running in this process' }
  if (stats.mode === 'off') return { name: 'cross-origin', status: 'warn', category: 'host', message: 'The origin guard is off (AIMAESTRO_ORIGIN_GUARD=off): any web page in your browser can reach this host' }
  const verb = stats.mode === 'enforce' ? 'refused' : 'would have been refused'
  const hint = 'A page that is not an AI Maestro dashboard tried to reach this host, or a real dashboard address is missing: add a reverse proxy or other address to AIMAESTRO_TRUSTED_ORIGINS, or the host to Settings > Hosts. Mode: AIMAESTRO_ORIGIN_GUARD=audit|enforce|off.'
  const items: DiagnosticItem[] = stats.entries.slice(0, 10).map(e => ({
    key: `origin:${e.reason}:${e.origin}:${e.host}:${e.path}`,
    status: 'warn' as const,
    message: `${e.count} ${e.method} ${e.path} ${verb}: ${e.reason}, Origin ${e.origin ?? '(none)'}, Host ${e.host || '(none)'}; last at ${new Date(e.last).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  }))
  return check('cross-origin', 'host', items, `No cross-origin browser requests ${verb} since the server started (mode: ${stats.mode})`, `${stats.total} browser request(s) ${verb} since the server started (mode: ${stats.mode})`, hint)
}

// ---------------------------------------------------------------------------
// policy (F042 / F118 step 1): the rules file loads, its lint warnings, and its own tests
// ---------------------------------------------------------------------------

export interface PolicyCheckInput {
  file: string
  version?: 1 | 2
  rules: unknown[]
  error?: string
  lint: { rule: string; message: string }[]
  tests: { test: { from: string; to: string; action?: string; expect: string }; got: string; pass: boolean; reason: string }[]
}

export function checkPolicyRules(p: PolicyCheckInput): DiagnosticCheck {
  const items: DiagnosticItem[] = []
  // No rules in force although a file exists: fail. The last good version still in force: warn
  if (p.error) items.push({ key: 'policy:error', status: p.version ? 'warn' : 'fail', path: p.file, message: p.error })
  for (const l of p.lint) items.push({ key: `policy:lint:${l.rule}`, status: 'warn', message: l.message })
  for (const [i, t] of p.tests.entries()) {
    if (!t.pass) items.push({ key: `policy:test:${i + 1}`, status: 'warn', message: `Test ${i + 1} (${t.test.from} -> ${t.test.to}, ${t.test.action || 'message'}) expects ${t.test.expect}, got ${t.got}: ${t.reason}` })
  }
  const ok = !p.version
    ? 'No policy file on this host: everyone may reach everyone'
    : `The policy file loads (version ${p.version}${p.version === 1 ? ', rules in order' : ''}, ${p.rules.length} rule(s), ${p.tests.length} test(s) pass)`
  return check('policy', 'host', items, ok, `The policy file has ${items.length} problem(s)`,
    `Fix ${p.file}. GET /api/policy shows the rules in force, the lint warnings and the test results; decisions are logged in ~/.aimaestro/policy/decisions.jsonl.`)
}

// ---------------------------------------------------------------------------
// policy-approvals (F118 step 2): the quarantine store reads, and no entry outlived its expiry unswept
// ---------------------------------------------------------------------------

export function checkPolicyApprovals(h: { file: string; pending: number; overdue: string[]; error?: string }): DiagnosticCheck {
  const items: DiagnosticItem[] = []
  if (h.error) items.push({ key: 'policy-approvals:store', status: 'fail', path: h.file, message: h.error })
  for (const id of h.overdue) items.push({ key: `policy-approvals:overdue:${id}`, status: 'warn', message: `Quarantine entry ${id} is past its expiry and still pending: the sweeper has not run (it runs once a minute in the server)` })
  return check('policy-approvals', 'host', items, `The quarantine store reads (${h.pending} pending)`, `The quarantine store has ${items.length} problem(s)`,
    `The store is ${h.file || '~/.aimaestro/policy/quarantine.json'}. While it cannot be read, every ask is refused. GET /api/v1/quarantine lists the entries (and expires overdue ones).`)
}

// ---------------------------------------------------------------------------
// crashed-agents (F044): agents left at their shell after too many crashes
// ---------------------------------------------------------------------------

export function checkCrashedAgents(agents: Agent[]): DiagnosticCheck {
  const items: DiagnosticItem[] = agents.filter(a => isLocal(a) && a.crashFailedAt).map(a => ({
    key: `agent:${a.name}`, status: 'fail',
    message: `${a.name}'s Claude Code crashed ${a.crashRestarts?.length || 'several'} times in 30 minutes (last ${a.crashFailedAt}); it is no longer restarted automatically`,
  }))
  return check('crashed-agents', 'agents', items, 'No agent is stuck after repeated crashes', `${items.length} agent(s) stopped after repeated crashes`, 'Look at the agent\'s terminal for the error, fix it, and start the agent again (Wake, or restart it).')
}

// ---------------------------------------------------------------------------
// startup-blocked (F044 item 8): a woken program stuck before its input box
// ---------------------------------------------------------------------------

export function checkStartupBlocked(agents: Agent[], reasonOf: (sessionName: string) => string | undefined): DiagnosticCheck {
  const items: DiagnosticItem[] = []
  for (const a of agents) {
    const reason = isLocal(a) && (a.name || a.alias) ? reasonOf((a.name || a.alias)!) : undefined
    if (reason) items.push({ key: `agent:${a.name}`, status: 'warn', message: `${a.name}: ${reason}` })
  }
  return check('startup-blocked', 'agents', items, 'No agent is stuck at startup', `${items.length} agent(s) stuck at startup`, "Open the agent's terminal and answer what it shows (a login, the folder-trust question, a picker).")
}
