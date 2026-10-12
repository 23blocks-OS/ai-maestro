/**
 * Remember what an agent was woken with (F040): the tool and the permission mode become the agent's own,
 * so the next wake needs no choice. Server side; used by the wake service when the screen sends `remember`.
 * It never throws into the wake: a failed save must not stop an agent from starting.
 */
import { getAgent, updateAgent } from '@/lib/agent-registry'
import { resolveProgramCommand } from '@/lib/program-command'
import { storedProgramName, looksLikeProgramPath } from '@/lib/program-names'
import { permissionModesFor } from '@/lib/program-choices'
import type { AgentPermissionMode } from '@/types/agent'

const MODES: string[] = ['supervised', 'planOnly', 'trustEdits', 'smartAuto', 'fullAutonomy']

export function rememberLaunchChoice(
  agentId: string,
  choice: { program?: string; permissionMode?: string },
): { saved: boolean; program?: string; permissionMode?: string } {
  try {
    const agent = getAgent(agentId)
    if (!agent) return { saved: false }
    const updates: { program?: string; permissionMode?: AgentPermissionMode } = {}

    // An agent that runs a wrapper script (often a sandbox) keeps it. A launch choice must never silently
    // replace it with a bare tool; changing it is a deliberate edit of the agent.
    if (agent.program && looksLikeProgramPath(agent.program.trim())) return { saved: false }

    let kind = null as ReturnType<typeof resolveProgramCommand>['kind']
    if (choice.program) {
      const raw = choice.program.trim()
      const resolved = resolveProgramCommand(raw)
      // Only a program that will actually launch is remembered; a typo must not replace a working setting.
      if (resolved.command && resolved.kind) {
        kind = resolved.kind
        updates.program = storedProgramName(resolved.kind, resolved.command)
      } else if (raw.toLowerCase() === 'none' || raw.toLowerCase() === 'terminal') {
        updates.program = 'none'
      }
    } else if (agent.program) {
      kind = resolveProgramCommand(agent.program).kind
    }

    if (choice.permissionMode && MODES.includes(choice.permissionMode)) {
      // Do not store a mode the tool cannot honour: it would look chosen and do nothing.
      if (!kind || permissionModesFor(kind).length === 0 || permissionModesFor(kind).includes(choice.permissionMode as AgentPermissionMode)) {
        if (kind && permissionModesFor(kind).length > 0) updates.permissionMode = choice.permissionMode as AgentPermissionMode
      }
    }

    if (!updates.program && !updates.permissionMode) return { saved: false }
    if (updates.program === agent.program) delete updates.program
    if (updates.permissionMode === agent.permissionMode) delete updates.permissionMode
    if (!updates.program && !updates.permissionMode) return { saved: true, program: agent.program, permissionMode: agent.permissionMode }

    updateAgent(agentId, updates)
    return { saved: true, program: updates.program ?? agent.program, permissionMode: updates.permissionMode ?? agent.permissionMode }
  } catch (error) {
    console.warn('[Wake] Could not remember the launch choice:', error instanceof Error ? error.message : error)
    return { saved: false }
  }
}
