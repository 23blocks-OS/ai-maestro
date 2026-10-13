/**
 * The tools the wake dialog offers, and what each one can do, in one place (F040).
 * Pure: no file system, so the browser and the server read the same facts.
 *
 * `permissionModes` lists the AI Maestro permission modes the tool can honour (checked against each CLI,
 * 2026-10-12). A tool that cannot honour a mode must not be offered it: the old dialog showed all five
 * Claude-named modes for every tool.
 */
import type { AgentPermissionMode } from '@/types/agent'
import { matchProgramName, isNoProgramName, looksLikeProgramPath, storedProgramName, type ProgramKind } from '@/lib/program-names'

export const ALL_PERMISSION_MODES: AgentPermissionMode[] = ['supervised', 'planOnly', 'trustEdits', 'smartAuto', 'fullAutonomy']

const MODES_BY_KIND: Partial<Record<ProgramKind, AgentPermissionMode[]>> = {
  claude: ALL_PERMISSION_MODES,
  // Grok's --permission-mode takes the same values as Claude Code; full autonomy is --always-approve.
  grok: ALL_PERMISSION_MODES,
  // Copilot CLI: it asks before a tool (supervised) or runs with --allow-all-tools. No plan/accept-edits/auto.
  copilot: ['supervised', 'fullAutonomy'],
  // Codex CLI: its default, read-only sandbox, automatic review of approvals, or no sandbox at all.
  codex: ['supervised', 'planOnly', 'smartAuto', 'fullAutonomy'],
}

/** The permission modes AI Maestro can apply to this tool (empty: nothing to choose). */
export function permissionModesFor(kind: ProgramKind | null | undefined): AgentPermissionMode[] {
  return (kind && MODES_BY_KIND[kind]) || []
}

/** Why there is no permission choice, for the tools that have none. */
export function noPermissionChoiceNote(kind: ProgramKind | null | undefined): string | null {
  if (!kind || permissionModesFor(kind).length > 0) return null
  switch (kind) {
    case 'pi': return 'Pi never asks before it acts, so there is nothing to choose. Run it where you are happy for it to change things.'
    default: return 'This tool has no permission setting that AI Maestro can apply.'
  }
}

export type ProgramGroup = 'main' | 'more' | 'shell'

export interface ProgramChoice {
  /** Value sent as the program override at wake. */
  id: string
  name: string
  description: string
  /** The command a launch runs ('none' for a plain shell). */
  command: string
  kind: ProgramKind | null
  group: ProgramGroup
}

export const PROGRAM_CHOICES: ProgramChoice[] = [
  { id: 'claude', name: 'Claude Code', description: "Anthropic's coding assistant", command: 'claude', kind: 'claude', group: 'main' },
  { id: 'codex', name: 'Codex CLI', description: "OpenAI's Codex command line tool", command: 'codex', kind: 'codex', group: 'main' },
  { id: 'grok', name: 'Grok Build', description: "xAI's terminal coding agent", command: 'grok', kind: 'grok', group: 'main' },
  { id: 'copilot', name: 'GitHub Copilot CLI', description: "GitHub's terminal coding agent; asks to trust each new folder once", command: 'copilot', kind: 'copilot', group: 'main' },
  { id: 'pi', name: 'Pi', description: 'Minimal terminal coding agent (pi.dev), needs a recent Node', command: 'pi', kind: 'pi', group: 'main' },
  // Recognised, but they only run in the terminal tab: no chat view, status or approval cards yet.
  { id: 'gemini', name: 'Gemini CLI', description: 'Runs in the terminal tab; no chat view yet', command: 'gemini', kind: 'gemini', group: 'more' },
  { id: 'opencode', name: 'OpenCode', description: 'Runs in the terminal tab; no chat view yet', command: 'opencode', kind: 'opencode', group: 'more' },
  { id: 'openclaw', name: 'OpenClaw', description: 'Runs in the terminal tab; no chat view yet', command: 'openclaw', kind: 'openclaw', group: 'more' },
  { id: 'terminal', name: 'Terminal Only', description: 'Plain shell without an AI assistant', command: 'none', kind: null, group: 'shell' },
]

/**
 * The program value a NEW agent is stored with for a chosen tool: Claude Code under its long-standing
 * "claude-code", a plain terminal as "none", every other tool under its command.
 */
export function programForCreate(choice: ProgramChoice): string {
  if (choice.command === 'none') return 'none'
  return choice.kind ? storedProgramName(choice.kind, choice.command) : choice.command
}

/**
 * The tools baked into the agent container image (agent-container/Dockerfile) and installed on an AWS server
 * (infrastructure/terraform/aws-agent/user_data.sh). A Docker or AWS agent can only run one of these.
 */
export const CONTAINER_TOOL_IDS = ['claude', 'codex', 'gemini'] as const

const CONTAINER_KINDS: ProgramKind[] = ['claude', 'codex', 'gemini']

/**
 * The command a container starts for a program name. "claude-code" and "Claude Code" are names, not commands
 * (the npm package installs `claude`), so the old wizard's `claude-code` typed a command that does not exist.
 * A name this image has no tool for passes through unchanged, so a custom image keeps working.
 */
export function containerProgram(program: string | undefined | null): string {
  const name = (program || '').trim()
  if (!name) return 'claude'
  if (looksLikeProgramPath(name)) return name
  const matched = matchProgramName(name)
  return matched && CONTAINER_KINDS.includes(matched.kind) ? matched.command : name
}

/** The offered choice for an agent's stored program, or null (a wrapper path, Aider, Cursor, anything else). */
export function choiceForProgram(program: string | undefined | null): ProgramChoice | null {
  if (!program || !program.trim()) return null
  // A path is a wrapper script (often a sandbox). It must NEVER match an offered tool: a wrapper named
  // claude-sandboxed.sh would otherwise show as plain Claude Code, and picking that would drop the sandbox.
  if (looksLikeProgramPath(program.trim())) return null
  if (isNoProgramName(program)) return PROGRAM_CHOICES.find((c) => c.id === 'terminal') || null
  const matched = matchProgramName(program)
  return (matched && PROGRAM_CHOICES.find((c) => c.kind === matched.kind)) || null
}

export interface WakeSelection {
  /** A choice id, or 'current': keep the agent's own program untouched (a wrapper, a retired tool). */
  choiceId: string
  mode: AgentPermissionMode
}

/**
 * What the wake dialog starts with: the agent's OWN tool (the old dialog always started on Claude Code),
 * and its stored permission mode when that tool can honour it, else the safe default.
 */
export function initialWakeSelection(agentProgram: string | undefined | null, storedMode: string | undefined | null): WakeSelection {
  const choice = choiceForProgram(agentProgram)
  const stored = (ALL_PERMISSION_MODES as string[]).includes(storedMode || '') ? (storedMode as AgentPermissionMode) : 'supervised'
  if (!choice) {
    // Nothing recorded yet: Claude Code, as before. Something recorded that we do not offer: keep it.
    const hasProgram = !!(agentProgram && agentProgram.trim())
    return { choiceId: hasProgram ? 'current' : 'claude', mode: hasProgram ? 'supervised' : stored }
  }
  const allowed = permissionModesFor(choice.kind)
  return { choiceId: choice.id, mode: allowed.includes(stored) ? stored : 'supervised' }
}
