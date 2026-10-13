/**
 * "How much should it ask first?" in plain words (F040 step 2).
 *
 * Three stops, Careful, Balanced and Hands-off, plus a Read-only switch, sit on top of the permission modes the
 * tool really has (lib/program-choices.ts). Each tool maps the stops to its own flags; a stop the tool cannot
 * honour is not offered (Copilot CLI has no Balanced). The five modes stay underneath and stay reachable, and the
 * command shown on the screen always names the real flag, so nothing is hidden.
 *
 * Careful   asks before it changes a file or runs a command
 * Balanced  edits files freely, still asks before commands (trust edits) or only for risky ones (smart auto)
 * Hands-off asks for nothing
 * Read-only can look around, cannot change anything (plan mode; Claude Code and Grok Build)
 */
import type { AgentPermissionMode } from '@/types/agent'
import { permissionModesFor } from '@/lib/program-choices'
import type { ProgramKind } from '@/lib/program-names'

export type FreedomStop = 'careful' | 'balanced' | 'handsOff'

export const STOP_LABEL: Record<FreedomStop, string> = { careful: 'Careful', balanced: 'Balanced', handsOff: 'Hands-off' }

/** One line per stop, shown under the control. */
export const STOP_HELP: Record<FreedomStop, string> = {
  careful: 'Asks before it changes a file or runs a command.',
  balanced: 'Edits files freely; still asks before running commands.',
  handsOff: 'Asks for nothing.',
}

/** How a person finishes "<agent> will start <tool>, ...". */
export const MODE_SUMMARY: Record<AgentPermissionMode, string> = {
  supervised: 'asks before every change',
  planOnly: 'read-only',
  trustEdits: 'edits freely, asks before commands',
  smartAuto: 'asks only for risky actions',
  fullAutonomy: 'asks for nothing',
}

const STOP_MODES: Record<FreedomStop, AgentPermissionMode[]> = {
  careful: ['supervised'],
  balanced: ['trustEdits', 'smartAuto'],
  handsOff: ['fullAutonomy'],
}

/** The stops this tool can honour, in order (empty: the tool has no permission choice). */
export function stopsFor(kind: ProgramKind | null | undefined): FreedomStop[] {
  const modes = permissionModesFor(kind)
  return (Object.keys(STOP_MODES) as FreedomStop[]).filter((s) => STOP_MODES[s].some((m) => modes.includes(m)))
}

/** Whether the tool has a read-only mode to switch on. */
export function canReadOnly(kind: ProgramKind | null | undefined): boolean {
  return permissionModesFor(kind).includes('planOnly')
}

/** Where a permission mode sits on the plain scale. Read-only is its own switch, so its stop is "careful". */
export function stopForMode(mode: AgentPermissionMode): { stop: FreedomStop; readOnly: boolean } {
  if (mode === 'planOnly') return { stop: 'careful', readOnly: true }
  const stop = (Object.keys(STOP_MODES) as FreedomStop[]).find((s) => STOP_MODES[s].includes(mode)) || 'careful'
  return { stop, readOnly: false }
}

/**
 * The permission mode for a stop. Read-only wins over the stop. Keeping the CURRENT mode when it already sits on
 * the chosen stop matters: someone who picked Smart auto in the exact list must not be moved to Trust edits
 * by clicking Balanced.
 */
export function modeForStop(
  kind: ProgramKind | null | undefined,
  stop: FreedomStop,
  readOnly: boolean,
  current?: AgentPermissionMode,
): AgentPermissionMode {
  const allowed = permissionModesFor(kind)
  if (readOnly && allowed.includes('planOnly')) return 'planOnly'
  if (current && STOP_MODES[stop].includes(current) && allowed.includes(current)) return current
  return STOP_MODES[stop].find((m) => allowed.includes(m)) || 'supervised'
}
