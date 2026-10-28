/**
 * What each tool lets you choose at launch, declared once (F040 step 2).
 *
 * The wake dialog is generated from these declarations, the server builds the command from the same ones,
 * and the dialog shows the exact command it will run. A new tool is one declaration plus tests, not a new
 * screen. Pure and browser-safe: no file system, so the screen and the server cannot disagree.
 *
 * Every flag here was read from the tool's own `--help` (2026-10-12: Claude Code, Grok Build 1.0.x,
 * Copilot CLI 1.0.96, Pi). Where a tool does not say what a flag accepts (Grok's reasoning effort), the
 * option is left out rather than guessed.
 *
 * Values end up in a shell command line (tmux send-keys), so each one is checked against a strict pattern:
 * no spaces, quotes, `;`, `$`, backticks or a leading `-`. A value that fails is dropped, never repaired.
 */
import { PERMISSION_MODE_TO_CLI, type AgentPermissionMode } from '@/types/agent'
import type { ProgramKind } from '@/lib/program-names'

export type LaunchOptionValue = string | boolean
export type LaunchOptions = Record<string, LaunchOptionValue>

export interface LaunchOptionDecl {
  id: string
  label: string
  help: string
  type: 'text' | 'choice' | 'toggle'
  /** The CLI flag. A toggle adds just the flag; text and choice add the flag and the value. */
  flag: string
  choices?: string[]
  /**
   * For a choice whose values are not "flag value": the exact command-line pieces each value adds (a value
   * missing from the map adds nothing). Used by Pi's tool profile, where one choice means several flags.
   */
  argsByChoice?: Record<string, string[]>
  placeholder?: string
  /** What a text value may look like. */
  pattern?: 'model' | 'path'
}

/** Pi's flags for the "messaging" tool profile. Static text: nothing from a request is ever added to it. */
export const PI_MESSAGING_ARGS = [
  '--tools', 'read,grep,find,ls,amp_inbox,amp_read,amp_reply,amp_send',
  '--exclude-tools', "'mcp__*'",
]

const MODEL: LaunchOptionDecl = {
  id: 'model', label: 'Model', help: 'Leave empty for the tool’s own default.', type: 'text', flag: '--model',
  placeholder: 'default', pattern: 'model',
}
const CONTINUE: LaunchOptionDecl = {
  id: 'continue', label: 'Continue the last session', help: 'Picks up the most recent conversation in this folder.', type: 'toggle', flag: '--continue',
}

const DECLARATIONS: Partial<Record<ProgramKind, LaunchOptionDecl[]>> = {
  claude: [MODEL],
  grok: [MODEL, CONTINUE],
  copilot: [
    MODEL,
    { id: 'effort', label: 'Reasoning effort', help: 'How hard it thinks before answering.', type: 'choice', flag: '--reasoning-effort',
      choices: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] },
    CONTINUE,
    { id: 'addDir', label: 'Extra folder', help: 'One more folder it may read and write (no spaces in the path).', type: 'text', flag: '--add-dir',
      placeholder: '~/projects/shared', pattern: 'path' },
  ],
  // Codex CLI 0.153.4 (`codex --help`). Its "continue" is the `resume --last` subcommand, not a flag, so it is not offered.
  codex: [
    MODEL,
    { id: 'search', label: 'Live web search', help: 'Lets it search the web without asking each time.', type: 'toggle', flag: '--search' },
    { id: 'addDir', label: 'Extra folder', help: 'One more folder it may write to (no spaces in the path).', type: 'text', flag: '--add-dir',
      placeholder: '~/projects/shared', pattern: 'path' },
  ],
  pi: [
    MODEL,
    { id: 'thinking', label: 'Thinking level', help: 'How much it reasons before answering.', type: 'choice', flag: '--thinking',
      choices: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] },
    CONTINUE,
    { id: 'noSession', label: 'Do not save the session', help: 'A throwaway run: nothing is kept afterwards.', type: 'toggle', flag: '--no-session' },
    // F036. "messaging" = read-only files plus the AI Maestro message tools (scripts/pi/ai-maestro-amp): no shell,
    // no write, no edit, no MCP tools. Pi's --tools is an allowlist (docs/cli.md#tools). This lowers accidents; it
    // is NOT a sandbox (Pi has none, and extensions run with the user's permissions).
    { id: 'tools', label: 'Tools', help: 'Full: everything Pi has. Messaging: read files and answer messages only, no shell or editing. Not a security boundary.',
      type: 'choice', flag: '--tools', choices: ['full', 'messaging'],
      argsByChoice: { messaging: PI_MESSAGING_ARGS } },
  ],
}

/** The options a tool declares (empty for a tool with none, or one we only open in the terminal). */
export function launchOptionsFor(kind: ProgramKind | null | undefined): LaunchOptionDecl[] {
  return (kind && DECLARATIONS[kind]) || []
}

const PATTERNS = {
  model: /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,99}$/,
  path: /^[A-Za-z0-9~/.][A-Za-z0-9._/~@+:-]{0,199}$/,
}

/**
 * The options that are known for this tool and valid. Anything else (unknown id, wrong type, a value that
 * fails its pattern, a choice not on the list) is dropped. A toggle counts only when it is exactly `true`.
 */
export function sanitizeLaunchOptions(kind: ProgramKind | null | undefined, raw: unknown): LaunchOptions {
  const out: LaunchOptions = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const input = raw as Record<string, unknown>
  for (const decl of launchOptionsFor(kind)) {
    const v = input[decl.id]
    if (decl.type === 'toggle') {
      if (v === true) out[decl.id] = true
    } else if (decl.type === 'choice') {
      if (typeof v === 'string' && decl.choices?.includes(v)) out[decl.id] = v
    } else if (typeof v === 'string') {
      const t = v.trim()
      if (t && PATTERNS[decl.pattern || 'model'].test(t)) out[decl.id] = t
    }
  }
  return out
}

/** The model chosen in the options, if any (the server applies it where it applied the agent's model). */
export function modelFromOptions(kind: ProgramKind | null | undefined, raw: unknown): string | undefined {
  const v = sanitizeLaunchOptions(kind, raw).model
  return typeof v === 'string' ? v : undefined
}

/** The command-line pieces for the options, in declaration order. The model is NOT included (see above). */
export function launchOptionArgs(kind: ProgramKind | null | undefined, raw: unknown): string[] {
  const options = sanitizeLaunchOptions(kind, raw)
  const args: string[] = []
  for (const decl of launchOptionsFor(kind)) {
    if (decl.id === 'model') continue
    const v = options[decl.id]
    if (v === undefined) continue
    if (decl.argsByChoice) args.push(...(decl.argsByChoice[String(v)] || []))
    else if (decl.type === 'toggle') args.push(decl.flag)
    else args.push(decl.flag, String(v))
  }
  return args
}

/**
 * Grok Build's flags for a permission mode. Its `--permission-mode` takes the same values as Claude Code, so
 * the Claude mapping applies; full autonomy is Grok's own `--always-approve`. Supervised adds nothing.
 * Grok has no folder-trust prompt (verified on 1.0.46).
 */
export function grokPermissionFlags(mode: AgentPermissionMode | string | undefined | null): string {
  const m = (mode || 'supervised') as AgentPermissionMode
  if (m === 'supervised') return ''
  if (m === 'fullAutonomy') return '--always-approve'
  const cli = PERMISSION_MODE_TO_CLI[m]
  return cli ? `--permission-mode ${cli}` : ''
}

/**
 * Copilot CLI's flags for a permission mode (checked on 1.0.96). Supervised adds nothing: it asks before a
 * tool. Full autonomy is `--allow-all-tools`, which keeps its path and URL checks (`--allow-all` and
 * `--yolo` would switch those off too). It has no plan, accept-edits or auto mode. Its first-launch folder
 * trust question is the person's to answer; no flag answers it.
 */
export function copilotPermissionFlags(mode: AgentPermissionMode | string | undefined | null): string {
  return mode === 'fullAutonomy' ? '--allow-all-tools' : ''
}

/**
 * Codex CLI's flags for a permission mode (checked on 0.153.4). Supervised adds nothing: its own default.
 * Read-only is `--sandbox read-only`. Smart auto is `--approve-for-me` (approval requests are reviewed
 * automatically inside the workspace-write sandbox). Full autonomy is its bypass flag. It has no accept-edits mode.
 */
export function codexPermissionFlags(mode: AgentPermissionMode | string | undefined | null): string {
  if (mode === 'planOnly') return '--sandbox read-only'
  if (mode === 'smartAuto') return '--approve-for-me'
  if (mode === 'fullAutonomy') return '--dangerously-bypass-approvals-and-sandbox'
  return ''
}

/** The permission flags for a tool, as the server adds them (Claude Code: `--permission-mode`, unless supervised). */
export function permissionFlagsFor(kind: ProgramKind | null | undefined, mode: AgentPermissionMode | string | undefined | null): string {
  if (kind === 'grok') return grokPermissionFlags(mode)
  if (kind === 'copilot') return copilotPermissionFlags(mode)
  if (kind === 'codex') return codexPermissionFlags(mode)
  if (kind === 'claude') {
    const m = (mode || 'supervised') as AgentPermissionMode
    return m === 'supervised' ? '' : `--permission-mode ${PERMISSION_MODE_TO_CLI[m]}`
  }
  return ''
}

/**
 * The command the screen shows under the form: the tool, then the model, the permission flag and the options.
 * It is the part a person chose. AI Maestro's own fixed additions (channels, telemetry, session name for
 * Claude Code; environment) are not choices and are not listed.
 */
export function previewCommand(input: {
  command: string
  kind: ProgramKind | null | undefined
  mode?: AgentPermissionMode | string | null
  options?: unknown
}): string {
  const parts = [input.command]
  const model = modelFromOptions(input.kind, input.options)
  if (model) parts.push('--model', model)
  const perm = permissionFlagsFor(input.kind, input.mode)
  if (perm) parts.push(perm)
  parts.push(...launchOptionArgs(input.kind, input.options))
  return parts.join(' ')
}
