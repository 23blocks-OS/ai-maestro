/**
 * One-click wake (F040 step 2): when an agent already has a recorded tool, Wake uses it and the permission
 * mode and options saved on the agent, with no dialog. The dialog opens for a first wake (nothing recorded),
 * and when the person asks to choose ("Wake with..."). Pure, so every screen that wakes an agent decides the
 * same way.
 */
import { choiceForProgram, permissionModesFor } from '@/lib/program-choices'
import { MODE_SUMMARY } from '@/lib/freedom'
import { looksLikeProgramPath, matchProgramName, isNoProgramName } from '@/lib/program-names'
import type { AgentPermissionMode } from '@/types/agent'
import type { WakeChoiceOptions } from '@/lib/wake-request'

interface WakeableAgent {
  program?: string
  permissionMode?: string
}

/** Wake without asking: only when the agent already has a tool recorded, so there is something to wake with. */
export function canWakeInOneClick(agent: WakeableAgent): boolean {
  return !!(agent.program && agent.program.trim())
}

/**
 * What a one-click wake sends. The program is empty so the server keeps the agent's own (a wrapper script stays
 * a wrapper script). The stored permission mode is sent explicitly, but only for a tool that can honour it, so
 * the request says what will happen; the launch options are left out and the server uses the ones saved on the agent.
 */
export function oneClickWakeOptions(agent: WakeableAgent): WakeChoiceOptions & { permissionMode?: AgentPermissionMode } {
  const choice = choiceForProgram(agent.program)
  const modes = permissionModesFor(choice?.kind)
  const stored = agent.permissionMode as AgentPermissionMode | undefined
  const mode = stored && modes.includes(stored) ? stored : modes.length > 0 ? 'supervised' : undefined
  return { permissionMode: mode, remember: false }
}

/** A readable name for the tool, for the toast. */
function toolName(program: string): string {
  const choice = choiceForProgram(program)
  if (choice) return choice.name
  if (isNoProgramName(program)) return 'a plain terminal'
  if (looksLikeProgramPath(program.trim())) return program.trim().split('/').pop() || program
  return matchProgramName(program)?.command || program
}

/** What a one-click wake starts, in words: "Claude Code, asks before changes". */
export function wakeSummary(agent: WakeableAgent): string {
  const mode = oneClickWakeOptions(agent).permissionMode
  return `${toolName(agent.program || '')}${mode ? `, ${MODE_SUMMARY[mode]}` : ''}`
}

/** The line shown while a one-click wake runs: what it starts and how freely. */
export function oneClickToast(name: string, agent: WakeableAgent): { title: string; message: string; handsOff: boolean } {
  return {
    title: `Waking ${name}`,
    message: `${wakeSummary(agent)}. Shift-click Wake to choose differently.`,
    handsOff: oneClickWakeOptions(agent).permissionMode === 'fullAutonomy',
  }
}
